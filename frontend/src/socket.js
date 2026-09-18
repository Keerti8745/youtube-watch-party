import { io } from "socket.io-client";

const socket = io("https://youtube-watch-party-backend-3tkx.onrender.com");

export default socket;