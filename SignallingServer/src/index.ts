import {WebSocket, RawData} from 'ws';

const wss = new WebSocket.Server({ port: 8081 }, () => {
    console.log("Signalling server is now listening on port 8081");
});

const wssBroadcast = (ws: WebSocket, data: string | number | readonly any[] | ArrayBuffer | DataView | ArrayBufferView | { valueOf(): ArrayBuffer; } | { valueOf(): readonly number[]; } | { valueOf(): string; } | { [Symbol.toPrimitive](hint: string): string; }) => {
    wss.clients.forEach((client) => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
};

wss.on('connection', (ws: WebSocket) => {
    const wssClientsSize = wss.clients.size;
    console.log(`Client connected. Total connected clients: ${wssClientsSize}`);

    ws.on('message', (message: RawData) => {
        console.log(message + "\n\n");
        wssBroadcast(ws, message);
    });
    ws.on('close', () => {
        const wssClientsSize = wss.clients.size;
        console.log(`Client disconnected. Total connected clients: ${wssClientsSize}`);
    })

    ws.on('error', (_error: Error) => {
        const wssClientsSize = wss.clients.size;
        console.log(`Client error. Total connected clients: ${wssClientsSize}`);
    });
});
