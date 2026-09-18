const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const PORT = 5000;
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "http://localhost:5173",
        methods: ["GET", "POST"]
    }
});

const rooms = {};

function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function canControlVideo(role) {
    return role === "HOST" || role === "MODERATOR";
}

function transferHost(roomId) {
    const room = rooms[roomId];
    if (!room || room.participants.length === 0) return false;

    let newHost = room.participants.find(
        (participant) => participant.role === "MODERATOR"
    );

    if (!newHost) {
        newHost = room.participants[0];
    }

    newHost.role = "HOST";
    room.host = newHost.socketId;

    const newHostSocket = io.sockets.sockets.get(newHost.socketId);

    if (newHostSocket) {
        newHostSocket.role = "HOST";
        newHostSocket.emit("host-transferred", {
            message: "You are now the HOST of this room."
        });
    }

    io.to(roomId).emit("participants-updated", {
        participants: room.participants
    });

    console.log(`${newHost.username} is now HOST of room ${roomId}`);
    return true;
}

app.get("/", (req, res) => {
    res.send("YouTube Watch Party Backend is Running!");
});

io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    // CREATE ROOM
    socket.on("create-room", () => {
        const roomId = generateRoomId();

        rooms[roomId] = {
            host: socket.id,
            currentVideo: "dQw4w9WgXcQ",
            isPlaying: false,
            currentTime: 0,
            participants: [{
                socketId: socket.id,
                username: "HOST",
                role: "HOST"
            }]
        };

        socket.join(roomId);
        socket.roomId = roomId;
        socket.username = "HOST";
        socket.role = "HOST";

        socket.emit("room-created", {
            roomId: roomId,
            role: "HOST"
        });

        io.to(roomId).emit("participants-updated", {
            participants: rooms[roomId].participants
        });

        console.log(`Room ${roomId} created by ${socket.id}`);
    });

    // JOIN ROOM
    socket.on("join-room", ({ roomId, username }) => {
        if (!roomId || !username) {
            socket.emit("join-error", {
                message: "Room ID and Username are required."
            });
            return;
        }

        roomId = roomId.trim().toUpperCase();
        username = username.trim();

        if (!rooms[roomId]) {
            socket.emit("join-error", {
                message: "Room does not exist."
            });
            return;
        }

        if (!username) {
            socket.emit("join-error", {
                message: "Username cannot be empty."
            });
            return;
        }

        const usernameExists = rooms[roomId].participants.some(
            (participant) =>
                participant.username.toLowerCase() === username.toLowerCase()
        );

        if (usernameExists) {
            socket.emit("join-error", {
                message: "This username is already taken in this room. Please choose another username."
            });
            return;
        }

        if (username.toUpperCase() === "HOST") {
            socket.emit("join-error", {
                message: "HOST is a reserved username. Please choose another username."
            });
            return;
        }

        socket.join(roomId);
        socket.roomId = roomId;
        socket.username = username;
        socket.role = "PARTICIPANT";

        rooms[roomId].participants.push({
            socketId: socket.id,
            username: username,
            role: "PARTICIPANT"
        });

        socket.emit("room-joined", {
            roomId: roomId,
            username: username,
            role: "PARTICIPANT"
        });

        socket.emit("room-state", {
            currentVideo: rooms[roomId].currentVideo,
            isPlaying: rooms[roomId].isPlaying,
            currentTime: rooms[roomId].currentTime
        });

        io.to(roomId).emit("participants-updated", {
            participants: rooms[roomId].participants
        });

        console.log(`${username} joined room ${roomId}`);
    });

    // LEAVE ROOM
    socket.on("leave-room", () => {
        const roomId = socket.roomId;

        if (!roomId || !rooms[roomId]) {
            socket.emit("left-room");
            return;
        }

        const leavingUser = rooms[roomId].participants.find(
            (participant) => participant.socketId === socket.id
        );

        if (!leavingUser) {
            socket.emit("left-room");
            return;
        }

        const wasHost = leavingUser.role === "HOST";

        rooms[roomId].participants = rooms[roomId].participants.filter(
            (participant) => participant.socketId !== socket.id
        );

        socket.leave(roomId);
        socket.roomId = null;
        socket.username = "";
        socket.role = "";

        if (rooms[roomId].participants.length === 0) {
            delete rooms[roomId];
            socket.emit("left-room");
            console.log(`Room ${roomId} deleted`);
            return;
        }

        if (wasHost) {
            transferHost(roomId);
        } else {
            io.to(roomId).emit("participants-updated", {
                participants: rooms[roomId].participants
            });
        }

        socket.emit("left-room");

        console.log(`${leavingUser.username} left room ${roomId}`);
    });

    // CHAT MESSAGE
    socket.on("send-message", ({ roomId, message }) => {
        if (!rooms[roomId]) {
            socket.emit("chat-error", {
                message: "Room does not exist."
            });
            return;
        }

        if (!socket.roomId || socket.roomId !== roomId) {
            socket.emit("chat-error", {
                message: "You are not a member of this room."
            });
            return;
        }

        if (typeof message !== "string") {
            socket.emit("chat-error", {
                message: "Invalid message."
            });
            return;
        }

        message = message.trim();

        if (!message) {
            socket.emit("chat-error", {
                message: "Message cannot be empty."
            });
            return;
        }

        const participant = rooms[roomId].participants.find(
            (user) => user.socketId === socket.id
        );

        if (!participant) {
            socket.emit("chat-error", {
                message: "You are not a participant of this room."
            });
            return;
        }

        io.to(roomId).emit("receive-message", {
            username: socket.username,
            message: message,
            role: socket.role,
            socketId: socket.id
        });

        console.log(`${socket.username} sent message in ${roomId}: ${message}`);
    });

    // ASSIGN MODERATOR
    socket.on("make-moderator", ({ roomId, participantSocketId }) => {
        if (!rooms[roomId]) return;

        if (socket.role !== "HOST") {
            socket.emit("permission-error", {
                message: "Only the HOST can assign a moderator."
            });
            return;
        }

        const participant = rooms[roomId].participants.find(
            (user) => user.socketId === participantSocketId
        );

        if (!participant) {
            socket.emit("action-error", {
                message: "Participant not found."
            });
            return;
        }

        if (participant.role === "HOST") {
            socket.emit("action-error", {
                message: "HOST cannot be made a moderator."
            });
            return;
        }

        participant.role = "MODERATOR";

        const participantSocket = io.sockets.sockets.get(participantSocketId);

        if (participantSocket) {
            participantSocket.role = "MODERATOR";
            participantSocket.emit("role-updated", {
                role: "MODERATOR"
            });
        }

        io.to(roomId).emit("participants-updated", {
            participants: rooms[roomId].participants
        });

        console.log(`${participant.username} is now MODERATOR in room ${roomId}`);
    });

    // REMOVE PARTICIPANT
    socket.on("remove-participant", ({ roomId, participantSocketId }) => {
        if (!rooms[roomId]) return;

        if (socket.role !== "HOST") {
            socket.emit("permission-error", {
                message: "Only the HOST can remove participants."
            });
            return;
        }

        const participant = rooms[roomId].participants.find(
            (user) => user.socketId === participantSocketId
        );

        if (!participant) {
            socket.emit("action-error", {
                message: "Participant not found."
            });
            return;
        }

        if (participant.role === "HOST") {
            socket.emit("action-error", {
                message: "HOST cannot be removed."
            });
            return;
        }

        rooms[roomId].participants = rooms[roomId].participants.filter(
            (user) => user.socketId !== participantSocketId
        );

        const participantSocket = io.sockets.sockets.get(participantSocketId);

        if (participantSocket) {
            participantSocket.emit("removed-from-room", {
                message: "You have been removed from the room by the HOST."
            });
            participantSocket.leave(roomId);
            participantSocket.roomId = null;
            participantSocket.role = "";
            participantSocket.disconnect(true);
        }

        io.to(roomId).emit("participants-updated", {
            participants: rooms[roomId].participants
        });

        console.log(`${participant.username} was removed from room ${roomId}`);
    });

    // PLAY VIDEO
    socket.on("play-video", ({ roomId, currentTime }) => {
        if (!rooms[roomId]) return;

        if (!canControlVideo(socket.role)) {
            socket.emit("permission-error", {
                message: "You do not have permission to control the video."
            });
            return;
        }

        rooms[roomId].isPlaying = true;
        rooms[roomId].currentTime = currentTime;

        socket.to(roomId).emit("play-video", {
            currentTime: currentTime
        });
    });

    // PAUSE VIDEO
    socket.on("pause-video", ({ roomId, currentTime }) => {
        if (!rooms[roomId]) return;

        if (!canControlVideo(socket.role)) {
            socket.emit("permission-error", {
                message: "You do not have permission to control the video."
            });
            return;
        }

        rooms[roomId].isPlaying = false;
        rooms[roomId].currentTime = currentTime;

        socket.to(roomId).emit("pause-video", {
            currentTime: currentTime
        });
    });

    // SEEK VIDEO
    socket.on("seek-video", ({ roomId, currentTime }) => {
        if (!rooms[roomId]) return;

        if (!canControlVideo(socket.role)) {
            socket.emit("permission-error", {
                message: "You do not have permission to control the video."
            });
            return;
        }

        rooms[roomId].currentTime = currentTime;

        socket.to(roomId).emit("seek-video", {
            currentTime: currentTime
        });
    });

    // CHANGE VIDEO
    socket.on("change-video", ({ roomId, videoId }) => {
        if (!rooms[roomId]) return;

        if (!canControlVideo(socket.role)) {
            socket.emit("permission-error", {
                message: "You do not have permission to change the video."
            });
            return;
        }

        if (!videoId || typeof videoId !== "string") {
            socket.emit("action-error", {
                message: "Invalid YouTube video ID."
            });
            return;
        }

        rooms[roomId].currentVideo = videoId;
        rooms[roomId].currentTime = 0;
        rooms[roomId].isPlaying = false;

        io.to(roomId).emit("change-video", {
            videoId: videoId
        });
    });

    // DISCONNECT
    socket.on("disconnect", () => {
        console.log("User disconnected:", socket.id);

        const roomId = socket.roomId;

        if (!roomId || !rooms[roomId]) return;

        const leavingUser = rooms[roomId].participants.find(
            (participant) => participant.socketId === socket.id
        );

        if (!leavingUser) return;

        const wasHost = leavingUser.role === "HOST";

        rooms[roomId].participants = rooms[roomId].participants.filter(
            (participant) => participant.socketId !== socket.id
        );

        if (rooms[roomId].participants.length === 0) {
            delete rooms[roomId];
            console.log(`Room ${roomId} deleted`);
            return;
        }

        if (wasHost) {
            transferHost(roomId);
        } else {
            io.to(roomId).emit("participants-updated", {
                participants: rooms[roomId].participants
            });
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});