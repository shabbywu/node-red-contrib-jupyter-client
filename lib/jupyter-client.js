const JupyterKernel = require('./client/kernel');

module.exports = function (RED) {
  function JupyterClient(config) {
    var node = this;
    RED.nodes.createNode(node, config);

    const BackendMaps = {
      'python3': new JupyterKernel(RED, node, 'python3')
    }
    node.on('input', function(msg) {
      let kernelStub = BackendMaps[config.language]
      let msg_req = msg.req
      let msg_res = msg.res

      // TODO: 定义更好的规则
      if (msg_req !== undefined) {
        msg.req = {
          query: msg_req.query,
          params: msg_req.params,
          headers: msg_req.headers,
          body: msg_req.body,
          cookies: msg_req.cookies,
        }
      }

      if (msg_res !== undefined) {
        delete msg.res
      }

      kernelStub.execute(msg, config.code).then(res => {
        if (msg_res !== undefined) {
          res.res = msg_res
        }
        if (msg_req !== undefined) {
          res.req = msg_req
        }
        node.send(res)
      })

    });

    node.on('close', function () {
      for (let backend in BackendMaps) {
        console.log("killing", backend)
        BackendMaps[backend].close()
      }
    });
  }
  RED.nodes.registerType('代码执行', JupyterClient);
};
