require('dotenv').config();
const WebSocketServer = require('websocket').server;
const server = require('http').createServer();
const express = require('express');
const app = express();
const bodyParser = require('body-parser');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded());
const fs = require('fs');
const qs = require('querystring');
const Nexmo = require('nexmo');
const nexmo = new Nexmo({
  apiKey: process.env.API_KEY,
  apiSecret: process.env.API_SECRET,
  applicationId: process.env.APP_ID,
  privateKey: './private.key',
});
const wsServer = new WebSocketServer({
  httpServer: server,
  autoAcceptConnections: false
});
const connections = new Map()


// 1. a form for putting in a phone number
app.get('/', (req, res, next) => {
  res.sendFile( __dirname + '/index.html')
})

// 2. handle a submitted number, start call to phone
app.post('/call', (req, res, next) => {
  const phoneNumber = req.body.number

  console.log(`Attempt call to ${phoneNumber}`)

  nexmo.calls.create({
    to: [{
      type: 'phone',
      number: phoneNumber
    }],
    from: {
      type: 'phone',
      number: process.env.NEXMO_NUMBER
    },
    answer_url: [`https://${process.env.URL}/call/respond`]
  }, (err, data) => {
    if(err) return next(err)

    res.redirect('/call?' + qs.stringify(data))
  })
})

// 3. web user directed to holding page, connect to server & wait
app.get('/call', (req, res, next) => {
  res.sendFile( __dirname + '/call.html')
})


// 4. connect incoming call to server
app.get('/call/respond', (req, res, next) => {
  console.log("responding to ", req.query)

  const conversation_uuid = req.query.conversation_uuid

  res.send([
    {
      "action": "connect",
      "eventUrl": [
        `https://${process.env.URL}/events`
      ],
      "endpoint": [{
        "type": "websocket",
        "uri": `ws://${process.env.URL}/nexmo/${conversation_uuid}`,
        "content-type": "audio/l16;rate=16000"
      }]
    }
  ])
})




app.post('/events', (req, res, next) => {
  console.log("EVENT", req.body)
  res.sendStatus(200)
});


wsServer.on('request', function(request) {

  const connection = request.accept(null, request.origin)


  // update the connection map
  connections.set(request.resource, connection)
  connection.on('close', function(reasonCode, description) {
    connections.delete(request.resource)
  })
  console.log("connections: " + Array.from(connections.keys()))


  // associate request with connection
  connection.resource = request.resource
  var re = /^\/(browser|nexmo)/
  if(request.resource.match(re)) {
    connection.other = request.resource.replace(re, str =>
      str == '/nexmo' ? '/browser' : '/nexmo'
    )
  }

  connection.on('message', function(message) {

    console.log('in> ', connection.resource)

    // proxy to other connection maybe
    var other = connections.get(connection.other)
    if(other) {
      console.log('forward> ', connection.other)

      if(message.type == 'binary') {
        other.sendBytes(message.binaryData)
      } else {
        other.send(message.utf8Data)
      }
    }

  });

});

server.on('request', app);
server.listen(8000, function(){
  console.log("Server listening on: http://localhost:%s", 8000);
});
