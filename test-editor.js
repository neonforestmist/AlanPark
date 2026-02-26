const { io } = require("socket.io-client");
const socket = io("http://localhost:3000");

socket.on("connect", () => {
  console.log("Connected");
  socket.emit("editor-create-room", { name: "Test", level: {} }, (response) => {
    console.log("Create room response:", response);
    process.exit(0);
  });
});
