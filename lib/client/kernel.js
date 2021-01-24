const UUID = require('uuid');
const ZMQSession = require('./session')
const connect = require('./connect')

const spwan = require("child_process").spawn

const ServersConfig = {
    python3: {
        cmd: "python3",
        args: ['-m', 'ipykernel', '--shell', '8081', '--iopub', '8082', '--Session.key=f5f7fb89-b84852dad5088e35375cb49c'],
        channels: {
            shell: 'tcp://127.0.0.1:8081',
            iopub: 'tcp://127.0.0.1:8082'
        },
        signature_key: 'f5f7fb89-b84852dad5088e35375cb49c',
        render: function (NODE_RED_MSG, code) {
            return `
import json;
import base64;
NODE_RED_MSG = json.loads(r'${JSON.stringify(NODE_RED_MSG)}');


${code}


NODE_RED_MSG = base64.b64encode(json.dumps(NODE_RED_MSG).encode("utf-8")).decode("utf-8")
            `
        }
    }
}

const JupyterKernel = function (RED, node, language) {
    this.RED = RED;
    this.node = node;

    const config = ServersConfig[language];
    const process = spwan(config.cmd, config.args);

    process.on('close', (code) => {
        if (code !== 0) {
            console.log(`进程退出，退出码 ${code}`);
        }
        this.process = process
    });

    process.on('error', (err) => {
        console.error('启动服务器失败');
        reject(err)
    });
    this.process = process;

    let ident = UUID.v4();
    this.iopub_channel = new ZMQSession(
        connect('iopub', config.channels.iopub),
        config.signature_key,
        ident
    );
    this.shell_channel = new ZMQSession(
        connect('shell', config.channels.shell),
        config.signature_key,
        ident
    );
    this.render = config.render;
    this.ident = ident;
}


JupyterKernel.prototype.close = function () {
    if (this.process) {
        this.process.kill();
    }
    delete this.client
}

JupyterKernel.prototype.execute = async function(NODE_RED_MSG, code) {
    const payload = {
        code: this.render(NODE_RED_MSG, code),
        user_expressions: {
            "NODE_RED_MSG": "NODE_RED_MSG"
        },
        silent: true,
        store_history: false,
        allow_stdin: false,
        stop_on_error: false
    }
    
    this.shell_channel.send('execute_request', payload, {});
    let {content} = await this.shell_channel.get_msg();
    
    NODE_RED_MSG['raw_content'] = content;
    
    if (content.status !== 'ok' && content.user_expressions['NODE_RED_MSG'].status !== 'ok') {
        return NODE_RED_MSG
    }

    await this.recvStream()
    
    let MSG_STR = content.user_expressions["NODE_RED_MSG"].data["text/plain"].replace(/\\\\/g, '\\')
    let output = JSON.parse(Buffer.from(MSG_STR.substr(1, MSG_STR.length - 2) , 'base64').toString())
    switch (typeof output) {
        case 'object':
            NODE_RED_MSG = output;
            break;
        default:
            NODE_RED_MSG.payload = output;
            break;
    }

    return NODE_RED_MSG
}

JupyterKernel.prototype.recvStream = async function () {
    const imageTypes = ['image/png', 'image/gif', 'image/jpeg', 'image/bmp']
    for(let msg of await this.iopub_channel.get_msgs()) {
        if (msg.ident !== this.ident) continue;
        let payload = undefined;
        switch (msg.topic) {
            case 'display_data':
                let data = msg.content.data
                let format = undefined
                for (let key in data) {
                    if (key.indexOf('image') !== -1) {
                        format = key
                        break
                    }
                }
                if (format !== undefined) {
                    payload = {
                        format: msg.topic,
                        msg: {
                            format,
                            type: 'image',
                            base64: data[format]
                        }
                    }
                } else {
                    payload = {
                        format: msg.topic,
                        msg: data
                    }
                }
                break;
            case 'stream.stdout':
                payload = {
                    format: msg.topic,
                    msg: msg.content.text,
                }
        }

        if (payload !== undefined) {
            this.RED.comms.publish('debug', {
                ...payload,
                // id: this.node.id,
                z: this.node.z,
                topic: this.node.type,
            })
        }
    }
}

module.exports = JupyterKernel
