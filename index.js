// server/index.js

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const bodyParser = require("body-parser");
const cors = require("cors");

// Initialize Express app
const app = express();

// Middleware Configuration

// Parse incoming JSON requests
app.use(bodyParser.json());

// CORS Configuration
// In production, replace '*' with your frontend's URL to enhance security
app.use(
  cors({
    origin: "https://cn-c-client.vercel.app", // Frontend URL without trailing slash
    methods: ["GET", "POST"],
    credentials: true,
  })
);

// Serve static files from the React app's build directory
app.use(express.static(path.join(__dirname, "..", "client", "build")));

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO with CORS settings
const io = new Server(server, {
  cors: {
    origin: "https://cn-c-client.vercel.app", // Frontend URL without trailing slash
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// In-memory queues for matchmaking
let confessorsQueue = [];
let listenersQueue = [];

// Utility function to generate unique room IDs
const generateRoomId = () => `room-${Math.random().toString(36).substr(2, 9)}`;

// Function to handle matchmaking between confessors and listeners
const attemptMatchmaking = () => {
  while (confessorsQueue.length > 0 && listenersQueue.length > 0) {
    const confessor = confessorsQueue.shift();
    const listener = listenersQueue.shift();

    const roomId = generateRoomId();

    // Assign both clients to the room
    confessor.join(roomId);
    listener.join(roomId);

    // Store room ID in socket objects for future reference
    confessor.roomId = roomId;
    listener.roomId = roomId;

    console.log(
      `Matched Confessor ${confessor.id} with Listener ${listener.id} in ${roomId}`
    );

    // Notify both clients about the successful match
    confessor.emit("matched", { role: "confessor", roomId });
    listener.emit("matched", { role: "listener", roomId });
  }
};

// Socket.IO Connection Handling
io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);

  // Handle role selection and add the socket to the appropriate queue
  socket.on("select_role", (role) => {
    socket.role = role;

    if (role === "confessor") {
      confessorsQueue.push(socket);
      console.log(`Confessor ${socket.id} added to the queue.`);
    } else if (role === "listener") {
      listenersQueue.push(socket);
      console.log(`Listener ${socket.id} added to the queue.`);
    } else {
      socket.emit("error_message", "Invalid role selected.");
      return;
    }

    // Attempt to matchmake after adding to the queue
    attemptMatchmaking();
  });

  // Handle incoming messages from clients
  socket.on("send_message", (data) => {
    const { message, mode } = data;
    const roomId = socket.roomId;

    if (!roomId) {
      socket.emit("error_message", "You are not in a chat room.");
      return;
    }

    switch (mode) {
      case "solo":
        // Confessor chooses to burn their confession
        socket.emit("burn_confession"); // Trigger burn animation on confessor's side
        socket.to(roomId).emit("confession_burned"); // Notify listener
        disconnectUsersFromRoom(roomId, socket.id); // Clean up room
        break;

      case "listening":
        // Listener sends "I'm listening" message
        socket.to(roomId).emit("receive_message", {
          from: "Listener",
          message: "I'm listening",
        });
        break;

      case "normal":
        // Confessor sends a regular message
        socket.to(roomId).emit("receive_message", {
          from: "Confessor",
          message,
        });
        break;

      default:
        socket.emit("error_message", "Invalid message mode.");
    }
  });

  // Handle client disconnection
  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);

    // Remove the socket from matchmaking queues if present
    confessorsQueue = confessorsQueue.filter((s) => s.id !== socket.id);
    listenersQueue = listenersQueue.filter((s) => s.id !== socket.id);

    // Notify the other participant if the disconnected socket was in a room
    if (socket.roomId) {
      socket.to(socket.roomId).emit("participant_disconnected");
      // Optionally, you can also perform additional cleanup here
    }
  });
});

// Helper Function: Disconnect all users from a specific room except the current socket
const disconnectUsersFromRoom = (roomId, currentSocketId) => {
  const room = io.sockets.adapter.rooms.get(roomId);
  if (room) {
    room.forEach((id) => {
      if (id !== currentSocketId) {
        const otherSocket = io.sockets.sockets.get(id);
        if (otherSocket) {
          otherSocket.leave(roomId);
          otherSocket.roomId = null; // Clear room ID
          console.log(`Socket ${id} left room ${roomId}`);
        }
      }
    });
  }
};

// Catch-All Handler: Serve the React app for any undefined routes
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "client", "build", "index.html"));
});

// Start the server
const PORT = process.env.PORT || 3000; // Railway typically assigns the PORT via environment variables
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
