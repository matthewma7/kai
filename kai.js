var request = require('request');
var logWithTime = require('./logWithTime');
var Promise = require("bluebird");

function Kai(statusChangeCallback){
	this._authCookie = null;
	this._connectionToken = null;
	this._lastInitTime = null;
	this._statusChangeCallback = statusChangeCallback;
	this._nextMessageId = 0;
	this._groupsToken = null;
	this._longpollId = null;

	this._tryInit();
}

Kai.prototype._init = function(){
	return new Promise(function(resolve, reject){
		logWithTime("initializing");
		request.post({
			url: "https://bus-serv.sensicomfort.com/api/authorize",
			method:"POST",
			headers:{
				"Accept":"application/json; version=1, */*; q=0.01",
				"Content-Type": "application/json",
				"X-Requested-With": "XMLHttpRequest"
			},
			json:{"UserName":"yourSensiUsername","Password":"YourSensiPassword"}

		})
		.on("response",function(response){
			var authCookie = response.headers["set-cookie"][0].split("; ")[0];
			request.get({
				url:"https://bus-serv.sensicomfort.com/realtime/negotiate?_=1454252746868",
				method:"GET",	
				json: true,
				headers:{
					"Accept":"application/json; version=1, */*; q=0.01",
					"Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
					"Cookie": authCookie
				}
			})
			.on('data',function(data){
				var connectionToken = JSON.parse(data.toString())['ConnectionToken'];
				this._authCookie = authCookie;
				this._connectionToken = connectionToken;
				this._lastInitTime = new Date();
				resolve();
			}.bind(this))
		}.bind(this));
	}.bind(this));
};

Kai.prototype._initLongpoll = function(){
	var longpollId = new Date().getTime();
	this._longpollId = longpollId;
	var longpoll = function(){
		this._tryInit();
		logWithTime("longpolling");
		request.get({
			url:"https://bus-serv.sensicomfort.com/realtime/poll",
			headers:{
				Accept:"application/json; version=1, */*; q=0.01",
				Cookie: this._authCookie
			},
			qs:{
				"transport":"longPolling",
				"connectionToken": this._connectionToken,
				"connectionData": '[{"name":"thermostat-v1"}]',
				"groupsToken": this._groupsToken,
				"messageId": this._nextMessageId,
				"tid": Math.floor(Math.random() * 11),
				"_": new Date().getTime()
			},
		 //    rejectUnauthorized: false, 
			// proxy : "http://127.0.0.1:8888"
		})
		.on("response",function(response){
				var data = "";
				response.on('data', function(chunk) {
					data += chunk.toString();
				});
				response.on('end', function() {
				// logWithTime(this._longpollId , longpollId);
				if(this._longpollId == longpollId){
					var response = JSON.parse(data.toString());
					this._nextMessageId = response["C"];
					// logWithTime("messageId", this._nextMessageId);
					this._statusChangeCallback(response["M"][0]);
					longpoll();
				}
			}.bind(this))
		}.bind(this))
	}.bind(this);


	logWithTime("connect");
	request.get({
		url:"https://bus-serv.sensicomfort.com/realtime/connect",
		headers:{
			Accept:"application/json; version=1, */*; q=0.01",
			Cookie: this._authCookie
		},
		qs:{
			"transport":"longPolling",
			"connectionToken": this._connectionToken,
			"connectionData": '[{"name":"thermostat-v1"}]',
			"tid": Math.floor(Math.random() * 11),
			"_": new Date().getTime()
		},
	 //    rejectUnauthorized: false, 
		// proxy : "http://127.0.0.1:8888"
	})
	.on("response",function(response){
			var data = "";
			response.on('data', function(chunk) {
				data += chunk.toString();
			});
			response.on('end', function() {
			var response = JSON.parse(data.toString());
			this._nextMessageId = response["C"];
			// logWithTime("messageId", this._nextMessageId);

			logWithTime("subscribe send");
			request.post({
				url:"https://bus-serv.sensicomfort.com/realtime/send",
				headers:{
					Accept:"application/json; version=1, */*; q=0.01",
					Cookie: this._authCookie
				},
				qs:{
					"transport":"longPolling",
					"connectionToken": this._connectionToken
				},
				form: {
					data : '{"H":"thermostat-v1","M":"Subscribe","A":["36-6f-92-ff-fe-03-6c-91"],"I":0}'
				},
			 //    rejectUnauthorized: false, 
				// proxy : "http://127.0.0.1:8888"
			})
			.on("response",function(response){		

					logWithTime("initial poll");
					request.get({
						url:"https://bus-serv.sensicomfort.com/realtime/poll",
						headers:{
							"Accept":"application/json; version=1, */*; q=0.01",
							"Cookie": this._authCookie,
							// "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
							// 'connection': 'keep-alive'
						},
						qs:{
							"transport":"longPolling",
							"connectionToken": this._connectionToken,
							"connectionData": '[{"name":"thermostat-v1"}]',
							"messageId": this._nextMessageId,
							"tid": Math.floor(Math.random() * 11),
							"_": new Date().getTime()
						},
					    // rejectUnauthorized: false, 
						// proxy : "http://127.0.0.1:8888"
					})
					.on("response",function(response){
						var data = "";
						response.on('data', function(chunk) {
							data += chunk.toString();
						});
						response.on('end', function() {
							var response = JSON.parse(data.toString());
							this._nextMessageId = response["C"];
							// logWithTime("messageId", this._nextMessageId);
							this._groupsToken = response["G"];
							if(response["G"]){
								logWithTime("get GroupsToken");
							}
							// logWithTime("group Token", this._groupsToken);
							this._statusChangeCallback(response["M"][0]);
							
							longpoll();

						}.bind(this))
					}.bind(this))

			}.bind(this))

		}.bind(this))
	}.bind(this))
};

Kai.prototype._longpoll = function(){

};

Kai.prototype._tryInit = function(){
	var p;
	if(!this._lastInitTime || new Date() - this._lastInitTime >= 15 * 60 * 1000){
		p = this._init()
		.then(this._initLongpoll.bind(this));
	}
	else{
		p = Promise.resolve();
	}
	return p;
}

Kai.prototype._sendRequest = function(data){
	return this._tryInit()
	.then(function(){
		logWithTime("Sending request");
		request.post({
			url:"https://bus-serv.sensicomfort.com/realtime/send",
			headers:{
				Accept:"application/json; version=1, */*; q=0.01",
				Cookie: this._authCookie
			},
			qs:{
				"transport":"longPolling",
				"connectionToken": this._connectionToken
			},
			form: {
				data : JSON.stringify(data)
			},
		    // rejectUnauthorized: false, 
			// proxy : "http://127.0.0.1:8888"
		})
		.on("data",function(data){
			logWithTime(data.toString());
		})
		.on("response",function(response){
			response.on("data", function(data){
				if(response.statusCode == 200){
					return data.toString();
				}
				else{
					logWithTime("Send failed");
					throw response.statusCode;
				}
			})
		})
	}.bind(this));
};

Kai.prototype.sendHoldRequest = function(mode, temperature){
	if(!mode || !temperature){
		logWithTime("no temperature or mode");
		return;
	}
	logWithTime("sending hold request for: " + mode + ' at ' + temperature);

	var data = {
		"H":"thermostat-v1",
		"M":mode == 'Heat' ? 'SetHeat' : 'SetCool',
		"A":["36-6f-92-ff-fe-03-6c-91",temperature,"F"],
		"I":3
	};
	return this._sendRequest(data);
};

Kai.prototype.resumeSchedule = function(){
	logWithTime("Sending resume schedule request");
	var data = {"H":"thermostat-v1","M":"SetScheduleMode","A":["36-6f-92-ff-fe-03-6c-91","On"],"I":2};
	return this._sendRequest(data);
};

module.exports = Kai;