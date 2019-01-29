var http = require('http');

const hostname = 'tyreco.co.ua.loc.nodejs_parser';
const port = '8080';

var server = http.createServer(function(req, res) {
    res.writeHead(200, {'Content-Type': 'text/plain'});
    var message = 'It works!\n',
        version = 'NodeJS ' + process.versions.node + '\n',
        response = [message, version].join('\n');
    res.end(response);
});
server.listen(port, hostname, () => {
    console.log('Server running at http://${',hostname,'}:${',port,'}/');
});
