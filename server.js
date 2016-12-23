require('dotenv').config();
const WebSocketServer = require('websocket').server;
const server = require('http').createServer();
const express = require('express');
const app = express();
const bodyParser = require('body-parser');
app.use(bodyParser.json());
const fs = require('fs');
const Nexmo = require('nexmo');
const nexmo = new Nexmo({
  apiKey: process.env.API_KEY,
  apiSecret: process.env.API_SECRET,
  applicationId: process.env.APP_ID,
  privateKey: './private.key',
});
const wsServer = new WebSocketServer({
  httpServer: server,
  autoAcceptConnections: true
});

let connectionsMap = new Map();

app.get('/', (req, res, next) => {
  fs.readFile('./index.html', function(error, data) {
    res.writeHead(200);
    res.end(data, 'utf-8');
  });
});

app.post('/events', (req, res, next) => {
  console.log(req.body);
  res.writeHead(200);
  res.end('', 'utf-8');
});

app.get('/ncco', (req, res, next) => {
  console.log('Call for NCCO');
  res.writeHead(200, {contentType: 'appliction/json'});
  res.end(JSON.stringify([
      {
        "action": "talk",
        "text": "Please hold"
      },
      {
        "action": "connect",
        "eventUrl": [
          `https://${process.env.URL}/events`
        ],
        "from": req.query.phoneNumber,
        "endpoint": [{
          "type": "websocket",
          "uri": `ws://${process.env.URL}`,
          "content-type": "audio/l16;rate=16000"
        }]
      }
    ]), 'utf-8');
});

wsServer.on('connect', function(connection) {
  console.log('New connetion');

  connection.on('message', function(message) {
    if (message.type === 'binary') {
      // TODO: Send to call

    } else if (message.utf8Data && JSON.parse(message.utf8Data).phoneNumber) {
      let phoneNumber = JSON.parse(message.utf8Data).phoneNumber;

      connectionsMap.set(phoneNumber, {
        browserConnection: connection,
        phoneConnection: undefined
      });

      console.log('Placing call to ' + phoneNumber);
      nexmo.calls.create({
        to: [{
          type: 'phone',
          number: phoneNumber
        }],
        from: {
          type: 'phone',
          number: process.env.NEXMO_NUMBER
        },
        answer_url: [`https://${process.env.URL}/ncco?phoneNumber=${phoneNumber}`]
      }, (err, data) => {
        console.log(err, data);
      });

    }
  });

  connection.on('close', function(reasonCode, description) {
    console.log((new Date()) + ' Peer ' + connection.remoteAddress + ' disconnected.');
  });
});

server.on('request', app);
server.listen(8000, function(){
  console.log("Server listening on: http://localhost:%s", 8000);
});