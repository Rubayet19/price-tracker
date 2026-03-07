import mongoose from "mongoose";
import User from "@/models/User";

const connectMongo = async () => {
  if (!process.env.MONGODB_URI) {
    throw new Error(
      "Add the MONGODB_URI environment variable inside .env.local to use mongoose"
    );
  }
  if (mongoose.connection.readyState >= 1) {
    return mongoose.connection;
  }
  return mongoose
    .connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      bufferCommands: true,
    })
    .catch((e) => console.error("Mongoose Client Error: " + e.message));
};

export default connectMongo;
