function logWithTime(){
	var arr = [];
	for(var i=0; i<arguments.length; i++){
		arr.push(arguments[i]);
	}
	arr.unshift(new Date().toUTCString());
	console.log.apply(console, arr);
}


module.exports = logWithTime;