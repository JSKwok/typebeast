const express = require('express');
const axios = require('axios');

const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const port = process.env.PORT || 8080;

let roomNum = 1; // Var tracks the room new users will be directed to.

const roomTracker = {
  totalUsers: 0
};

const formattedClients = {};

/*

roomTracker object: {
  total: 12,
  room-1: {
    users: 3,
    quote: ''
  }
}

formattedClients = {
  room-1 :
    socket-1 : {
      username:
      car:
    }
}

*/



const getQuote = room => {
  if (!roomTracker['room-' + roomNum]['quote']) {
    axios
      .get('http://127.0.0.1:8081/api/quotes')
      .then(res => {
        room['quote'] = res.data.data.quote;
        // console.log(roomTracker);
      })
      .catch(e => console.log(e.message));
  }
};

let alreadyInRoom = false;

io.on('connection', function(socket) {
  roomTracker.totalUsers++;
  console.log('\na user connected, users in server:', roomTracker.totalUsers);

  // Handler to receive username and vehicle. Must happen first.
  socket.on('user-update', data => {
    const formattedData = JSON.parse(data).user;

    // If room doesn't exist, create it.
    if (!formattedClients[`room-${roomNum}`]) {
      formattedClients[`room-${roomNum}`] = {};
    }

    // Check if username already in room and set value.
    // function userInRoom () {
    //   for (let socket in formattedClients[`room-${roomNum}`]) {
    //     const existing = formattedClients[`room-${roomNum}`][socket].username
    //     const newUser = formattedData.username
    //     console.log(newUser, existing)
    //     if (newUser === existing) {
    //       return true;
    //     }
    //   }
    //   return false;
    // }
    // alreadyInRoom = userInRoom();
    // console.log('Is the user in room formatted clients', )
    // If username not in room, proceed. Else, put user data in newer room.
    // if (!alreadyInRoom) {
    formattedClients[`room-${roomNum}`][socket.id] = formattedData;
    // } else {
    //   formattedClients[`room-${roomNum + 1}`] = {};
    //   formattedClients[`room-${roomNum + 1}`][socket.id] = formattedData;
    // }

    console.log(`===============================`);
    console.log(formattedClients)

    io.to(`room-${roomNum}`).emit(
      'user-update',
      JSON.stringify(formattedClients[`room-${roomNum}`])
    );
  });

  console.log('Is the user in room?', alreadyInRoom)

  //If it's the first user, the room doesn't exist - make the room.
  if (!roomTracker['room-' + roomNum]) {
    socket.join('room-' + roomNum);
    // Create an object to track the users and quote in a room
    roomTracker['room-' + roomNum] = {
      users: 1,
      quote: ''
    };
    getQuote(roomTracker['room-' + roomNum]);

    //If the room is not at max capacity (4), add user to the room
  } else if (
    roomTracker['room-' + roomNum] &&
    roomTracker['room-' + roomNum]['users'] < 4
    // !alreadyInRoom
  ) {
    socket.join('room-' + roomNum);
    roomTracker['room-' + roomNum]['users']++;
    //If the room exists and is at capacity, increase the room number, join the new room, set count to 1
  } else {
    roomNum++;
    socket.join('room-' + roomNum);
    roomTracker['room-' + roomNum] = {
      users: 1,
      quote: ''
    };
    getQuote(roomTracker['room-' + roomNum]);
  }

  console.log(roomTracker)

  //Set up variable to get array of socket IDs in current room
  let clients = io.sockets.adapter.rooms['room-' + roomNum];
  let clientsArray = Object.keys(clients.sockets);

  socket.emit('save-socket', {
    socketId: socket.id,
    clients: clientsArray,
    roomNum
  });

  //Broadcast that a new user joined to everyone ~else~
  socket.broadcast.to('room-' + roomNum).emit('new-user-join', {
    socketId: socket.id,
    clients: clientsArray,
    formattedClients: formattedClients[`room-${roomNum}]`]
  });

  //Check if the room is at capacity
  socket.on('initiate', () => {
    roomNum++; // Stops more people from joining the initiated room.
    io.to(Object.keys(socket.rooms)[1]).emit('game-start', {
      description: '3 players in room. Game starting shortly.',
      quote: roomTracker[Object.keys(socket.rooms)[1]]['quote']
    });
  });

  //When receiving an update from a user, broadcast to all users in the room
  socket.on('progress-update', completion => {
    // console.log('What room is this', Object.keys(socket.rooms));
    io.to(Object.keys(socket.rooms)[1]).emit('progress-broadcast', {
      socketId: socket.id,
      roomId: socket.rooms[1],
      completion: completion
    });
  });

  socket.on('game-finish', stats => {
    io.to(Object.keys(socket.rooms)[1]).emit('user-finish', {
      socketId: socket.id,
      roomId: Object.keys(socket.rooms)[1],
      completion: { progress: 1 },
      wpm: stats.wpm,
      position: stats.position
    });
  });

  socket.on('disconnecting', function() {
    if (
      formattedClients[`room-${roomNum}`] &&
      formattedClients[`room-${roomNum}`][socket.id]
    ) {
      delete formattedClients[`room-${roomNum}`][socket.id];
    }

    const rooms = Object.keys(socket.rooms).slice();

    roomTracker[rooms[1]]['users']--;
    roomTracker.totalUsers--;
    console.log(roomTracker)

    io.to(rooms[1]).emit('player-left', {
      description: `${socket.id} has left the game.`,
      formattedClients: formattedClients[`room-${roomNum}`]
    });
  });

  socket.on('disconnect', function() {
    console.log('A user disconnected', socket.id);
  });
});

http.listen(port, function() {
  console.log(`Listening on :${port}`);
});
