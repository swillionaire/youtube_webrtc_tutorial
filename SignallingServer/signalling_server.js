const WebSocket = require('ws');
// Refering type WebSocket.ServerOptions
const wssOptions = { port: 8081, host: "0.0.0.0" };
const wss = new WebSocket.Server( wssOptions, () => {
    console.log("Signalling server is now listening on port " + wssOptions.port + " on " + wssOptions.host || "127.0.0.1 (as default)");
});

wss.broadcast = (ws, data) => {
    wss.clients.forEach((client) => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
};

wss.on('connection', ws => {
    console.log(`Client connected. Total connected clients: ${wss.clients.size}`);

    ws.on('message', message => {
        // msg = JSON.parse(message);
        console.log(message + "\n\n");
        wss.broadcast(ws, message);
    });
    ws.on('close', ws=> {
        console.log(`Client disconnected. Total connected clients: ${wss.clients.size}`);
    })

    ws.on('error', error => {
        console.log(`Client error. Total connected clients: ${wss.clients.size}`);
    });
});
