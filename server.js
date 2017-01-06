var Promise = require("bluebird");
// var fs = require("fs");
var express = require('express');
var bodyParser = require('body-parser');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);
var merge = require('deepmerge');
var mongo = require('mongodb');
var monk = require('monk');
var db = null;
if(!process.env.OPENSHIFT_MONGODB_DB_URL){
	db = monk('localhost:27017/kai');
}
else{
	db = monk(process.env.OPENSHIFT_MONGODB_DB_URL);
}
var kai = new (require('./kai'))(receivedStatus);
var logWithTime = require('./logWithTime');

db.get("log").index("datetime");

app.use(function(req, res, next) {
	res.header("Access-Control-Allow-Origin", "*");
	res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
	next();
});

app.use(function(req, res, next){
    req.db = db;
    next();
});

app.use(bodyParser.urlencoded(
{
	limit: '50mb',
	extended: true
}));

app.use(bodyParser.json(
{
	limit: '50mb'
}));

app.use('/', express.static('static'));
// app.use('/log', express.static('log'));

var ipaddress = process.env.OPENSHIFT_NODEJS_IP;
var port = process.env.OPENSHIFT_NODEJS_PORT || 34567;
if(ipaddress){
	server.listen(port, ipaddress, function () {
		logWithTime('started at ip:' + ipaddress + ' port:' + port);
	});
}
else{
	server.listen(port, function () {
		logWithTime('started at ip:' + ipaddress + ' port:' + port);
	});
}


var lastHoldRequest = null;
// if(fs.existsSync("db.json")){
// 	lastHoldRequest = JSON.parse(fs.readFileSync("db.json"));
// }

var resumeHandle = null;
app.route("/hold")	
	.post(function(req, res){
		logWithTime(req.body);
		var holdRequest = req.body;
		if(holdRequest && holdRequest.temperature){
			logWithTime("receive hold request for " + holdRequest.temperature + " for " + holdRequest.duration + " seconds");
		}
		
		// fs.writeFile('db.json', JSON.stringify(lastHoldRequest));
		kai.sendHoldRequest(holdRequest.mode, holdRequest.temperature)
		.then(function(){
			clearTimeout(resumeHandle);
			if(holdRequest.duration){
				resumeHandle = setTimeout(function(){
					kai.resumeSchedule();
					lastHoldRequest = null;
					// fs.unlink('db.json');
				}, holdRequest.duration * 1000);
			}
			holdRequest.time = new Date();
			lastHoldRequest = holdRequest;
			res.sendStatus(200);
		});
	});

app.route("/resume")
	.post(function(req, res){
		kai.resumeSchedule();
		lastHoldRequest = null;
		// fs.unlink('db.json');
		res.sendStatus(202);
	})

app.route("/status")
	.get(function(req, res){
		var result = {};
		if(lastHoldRequest){
			result.holdRequest = lastHoldRequest;
		}
		res.json(result);
	})

app.route("/log/:date")
	.get(function(req, res){
		var startDatetime = new Date(req.params.date);
		var endDatetime = new Date(startDatetime.getTime() + 86400000);
		var log = db.get("log");
		log.find({ 
			datetime: {
				$gte: startDatetime,
				$lt: endDatetime
			}
		}, function(err, logs){
			var output = "";
			for(var i=0; i<logs.length; i++){
				output += logs[i].datetime.toLocaleString() + " : " + logs[i].temperature + "<br />";
			}
			res.send(output);
		});
	})

var currentStatus = {};
function receivedStatus(status){
	if(status){
		currentStatus = merge(currentStatus, status);
		io.emit('status',status);

		logTemperature(status);
	}
}

io.on('connection', function (socket) {
	socket.emit('status', currentStatus);
});

function getProperty(obj, properties){
	var root = obj;
	for(var i=0; i < properties.length; i++){
		root = root[properties[i]];
		if(root == undefined){
			return root;
		}
	}
	return root;
}

function logTemperature(status){
	var thermoStatus = status["A"][1];
	var now = new Date();
	var temperature = getProperty(thermoStatus, ["OperationalStatus", "Temperature"]);
	if(temperature != undefined){
		console.log("writelog");
		// var filepath = 'log/' + now.toLocaleDateString().replace(/\//g,"-") + ".txt";
		// fs.appendFile(filepath, now.toLocaleString()+ ":" + temperature.F + "\r\n");
		var log = db.get("log");
		log.insert({ datetime: now, temperature: temperature.F })
		.error(function(err){
			console.log(err);
		});
	}
}