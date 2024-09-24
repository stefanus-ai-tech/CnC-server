// server/index.js
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const path = require("path");
const bodyParser = require("body-parser");

const app = express();

// Middleware
app.use(bodyParser.json());

// Serve static files from the React app
app.use(express.static(path.join(__dirname, "..", "client", "build")));

// Create HTTP server and set up Socket.IO
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "https://cn-c-client.vercel.app/", // Update this in production to restrict origin to your frontend URL
    methods: ["GET", "POST"],
  },
});

app.use(
  cors({
    origin: "https://cn-c-client.vercel.app/",
    methods: ["GET", "POST"],
    credentials: true,
  })
);

// In-memory queues for matchmaking
let confessorsQueue = [];
let listenersQueue = [];

// Utility function to generate unique room IDs
const generateRoomId = () => `room-${Math.random().toString(36).substr(2, 9)}`;

// Handle matchmaking between confessors and listeners
const attemptMatchmaking = () => {
  while (confessorsQueue.length > 0 && listenersQueue.length > 0) {
    const confessor = confessorsQueue.shift();
    const listener = listenersQueue.shift();

    const roomId = generateRoomId();

    // Assign both clients to the room
    confessor.join(roomId);
    listener.join(roomId);

    // Set room IDs on the sockets for reference
    confessor.roomId = roomId;
    listener.roomId = roomId;

    console.log(
      `Matched Confessor ${confessor.id} with Listener ${listener.id} in ${roomId}`
    );

    // Notify both clients that they have been matched
    confessor.emit("matched", { role: "confessor", roomId });
    listener.emit("matched", { role: "listener", roomId });
  }
};

// Socket.IO connection handling
io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);

  // Handle role selection and add to respective queue
  socket.on("select_role", (role) => {
    socket.role = role;

    if (role === "confessor") {
      confessorsQueue.push(socket);
      console.log(`Confessor ${socket.id} added to the queue.`);
    } else if (role === "listener") {
      listenersQueue.push(socket);
      console.log(`Listener ${socket.id} added to the queue.`);
    }
    attemptMatchmaking();
  });

  // Handle sending messages
  socket.on("send_message", (data) => {
    const { message, mode } = data;
    const roomId = socket.roomId;

    if (!roomId) {
      socket.emit("error_message", "You are not in a chat room.");
      return;
    }

    switch (mode) {
      case "solo":
        // Trigger burn animation for the confessor
        socket.emit("burn_confession");
        socket.to(roomId).emit("confession_burned");
        disconnectUsersFromRoom(roomId, socket.id);
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
        socket
          .to(roomId)
          .emit("receive_message", { from: "Confessor", message });
        break;
      default:
        socket.emit("error_message", "Invalid message mode.");
    }
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
    confessorsQueue = confessorsQueue.filter((s) => s.id !== socket.id);
    listenersQueue = listenersQueue.filter((s) => s.id !== socket.id);

    // Notify the other participant if the user was in a room
    if (socket.roomId) {
      socket.to(socket.roomId).emit("participant_disconnected");
    }
  });
});

// Helper function to disconnect all users from a room
const disconnectUsersFromRoom = (roomId, currentSocketId) => {
  const roomSockets = io.sockets.adapter.rooms.get(roomId);
  if (roomSockets) {
    roomSockets.forEach((id) => {
      if (id !== currentSocketId) {
        const otherSocket = io.sockets.sockets.get(id);
        if (otherSocket) {
          otherSocket.leave(roomId);
        }
      }
    });
  }
};

// The catch-all handler: serves the React app for any request not handled by API
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "client", "build", "index.html"));
});

const PORT = process.env.PORT || 3000; // Adjust the port if necessary
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
