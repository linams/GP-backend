const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const faceapi = require("face-api.js");
const path = require("path");
const canvas = require("canvas");
const bodyparser=require("body-parser")

// Monkey-patch face-api.js for Node.js
faceapi.env.monkeyPatch({
  Canvas: canvas.Canvas,
  Image: canvas.Image,
  ImageData: canvas.ImageData,
});

// Initialize app
const app = express();

// CORS configuration
const corsOptions = {
  origin: "http://localhost:3000", // Update with your front-end URL
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"],
};
app.use(cors(corsOptions)); // Enable CORS
app.use(bodyparser.urlencoded({extended:true}))
app.use(bodyparser.json())
app.use(express.json({ limit: "10mb" })); // Handle large base64 data

// MongoDB Schema and Model
const studentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  faceVector: { type: [Number], required: true }, // Store a single face vector for simplicity
});

const Student = mongoose.model("Student", studentSchema);

// Load FaceAPI Models
const loadModels = async () => {
  const modelPath = path.join(__dirname, "./models");
  await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelPath);
  await faceapi.nets.faceLandmark68Net.loadFromDisk(modelPath);
  await faceapi.nets.faceRecognitionNet.loadFromDisk(modelPath);
};

// Convert Base64 Image to Face Vector
const imageToVector = async (base64Image) => {
  const base64Data = base64Image.split(",")[1]; // Remove "data:image/jpeg;base64,"
  const buffer = Buffer.from(base64Data, "base64");
  const img = await canvas.loadImage(buffer);
  const detections = await faceapi
    .detectSingleFace(img)
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detections) {
    throw new Error("No face detected in the provided image.");
  }

  return Array.from(detections.descriptor); // Convert Float32Array to regular array
};

// Register API
app.post("/api/register", async (req, res) => {
  console.log(req.body)
  console.log("data")
  const { name, email, password, photo } = req.body;

  if (!name || !email || !password || !photo) {
    return res.status(400).json({ message: "All fields are required." });
  }

  try {
    // Convert photo to vector
    const faceVector = await imageToVector(photo);

    // Check if the student already exists
    const existingStudent = await Student.findOne({ email });
    if (existingStudent) {
      return res.status(400).json({ message: "Student with this email already exists." });
    }

    // Create a new student record
    const newStudent = new Student({ name, email, password, faceVector });
    await newStudent.save();

    res.status(201).json({ message: "Student registered successfully." });
    console.log("registered successfuly")
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to register student." });
  }
});

// Enroll API
app.post("/api/enroll", async (req, res) => {
  const { email, password, photo } = req.body;

  if (!email || !password || !photo) {
    return res.status(400).json({ message: "All fields are required." });
  }

  try {
    // Convert photo to vector
    const faceVector = await imageToVector(photo);

    // Find the student by email
    const student = await Student.findOne({ email });
    if (!student) {
      return res.status(404).json({ message: "Student not found." });
    }

    // Check if passwords match
    if (student.password !== password) {
      return res.status(403).json({ message: "Invalid password." });
    }

    // Compare the face vector with the stored vector
    const similarity = faceapi.euclideanDistance(faceVector, student.faceVector);
    const similarityThreshold = 0.6; 

    if (similarity <= similarityThreshold) {
      res.status(200).json({ message: "Enrollment successful." });
    } else {
      res.status(403).json({ message: "Face does not match." });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to enroll student." });
  }
});

// Connect to MongoDB and Start Server
const startServer = async () => {
  try {
    await mongoose.connect("mongodb://localhost:27017/students_data", {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("Connected to MongoDB");

    await loadModels();
    console.log("FaceAPI models loaded");

    app.listen(3002, () => {
      console.log("Server running on http://localhost:3002");
    });
  } catch (error) {
    console.error("Failed to start server:", error);
  }
};

startServer();
