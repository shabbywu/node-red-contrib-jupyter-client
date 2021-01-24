const zeromq = require("zeromq");

const CHANNEL_TYPES = {
    shell: 'dealer',
    iopub: 'sub'
}

function connect(channel, addr) {
    console.log("connect to", channel, addr, CHANNEL_TYPES[channel])
    const socket = zeromq.socket(CHANNEL_TYPES[channel])
    socket.connect(addr)
    if (channel === 'iopub') {
        socket.subscribe('')
    }
    return socket
}

module.exports = connect
