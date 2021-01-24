const UUID = require('uuid');
const crypto = require('crypto');

const {sleep, safe_json_dump} = require('./utils')

const DELIM = '<IDS|MSG>';


class ZMQSession {
    constructor (socket, signature_key, ident) {
        this.socket = socket
        this.signature_key = signature_key
        this.base_msg_id = UUID.v4();
        this.ident = ident
        this.message_sended = 0;
        this.message_list = []
        this.socket.on('message', this.recv.bind(this))
    }

    get msg_id () {
        this.message_sended += 1;
        return `${this.base_msg_id}_${this.message_sended}`
    }

    send (msg_type, content, metadata={}) {
        const data = [
            safe_json_dump({
                msg_type,
                msg_id: this.msg_id,
                ident: this.ident,
            }),
            safe_json_dump({}),
            safe_json_dump(metadata || {}),
            safe_json_dump(content)
        ]
        const signature = this.hmac_sign(data.join(''))
        const payload = [
            this.ident, DELIM, signature, ...data
        ]
        // 发送信息
        this.socket.send(payload)
    }

    async get_msg (block=true) {
        let timeout = 100;
        while( block && this.message_list.length === 0 && timeout) {
            await sleep(1000);
        }
        return this.message_list.shift();
    }

    async get_msgs () {
        let messages = [];
        while (this.message_list.length > 0) {
            let msg = await this.get_msg(false);
            messages.push(msg);
        }
        return messages;
    }

    // 辅助函数
    hmac_sign (string) {
        // 生成 hamc 数字签名
        const hmac = crypto.createHmac('sha256', this.signature_key);
        hmac.update(string);
        return hmac.digest('hex');
    }

    recv (topic, delim, signature, header, parent_header, metadata, content) {
        if (delim.toString() !== DELIM) {
            return
        }
        [topic, signature, header, parent_header, metadata, content] = [topic, signature, header, parent_header, metadata, content].map(item => item.toString())

        header = JSON.parse(header)
        parent_header = JSON.parse(parent_header)
        this.message_list.push({
            ident: parent_header.ident,
            msg_id: header.msg_id,
            msg_type: header.msg_type,
            topic,
            signature, 
            header,
            parent_header,
            metadata: JSON.parse(metadata),
            content: JSON.parse(content)
        })
    }
}

module.exports = ZMQSession
