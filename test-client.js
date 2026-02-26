const io = require("socket.io-client");
const socket = io("http://localhost:3000");

socket.on("connect", () => {
  console.log("Connected");
  socket.emit("editor-create-room", { name: "Test", level: {} }, (res) => {
    console.log("Response:", res);
    process.exit(0);
  });
});
