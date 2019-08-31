var Accessory, Service, Characteristic, UUIDGen, FakeGatoHistoryService;
var inherits = require('util').inherits;
const fs = require('fs');
const packageFile = require("./package.json");
var os = require("os");
var hostname = os.hostname();

module.exports = function(homebridge) {
    if(!isConfig(homebridge.user.configPath(), "accessories", "RaspberryPiInfo")) {
        return;
    }
    
    Accessory = homebridge.platformAccessory;
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    UUIDGen = homebridge.hap.uuid;
    FakeGatoHistoryService = require("fakegato-history")(homebridge);

    homebridge.registerAccessory('homebridge-raspberrypi-info', 'RaspberryPiInfo', RaspberryPiInfo);
}

function readUptime() {
	const exec = require('child_process').exec;
	var script = exec('uptime > /tmp/uptime.txt',
		(error, stdout, stderr) => {
			if (error !== null) {
				//this.log("exec error: " + ${error});
			}
		});			
};

function isConfig(configFile, type, name) {
    var config = JSON.parse(fs.readFileSync(configFile));
    if("accessories" === type) {
        var accessories = config.accessories;
        for(var i in accessories) {
            if(accessories[i]['accessory'] === name) {
                return true;
            }
        }
    } else if("platforms" === type) {
        var platforms = config.platforms;
        for(var i in platforms) {
            if(platforms[i]['platform'] === name) {
                return true;
            }
        }
    } else {
    }
    
    return false;
};

function RaspberryPiInfo(log, config) {
    if(null == config) {
        return;
    }

    this.log = log;
    this.name = config["name"];
    if(config["file"]) {
        this.readFile = config["file"];
    } else {
        this.readFile = "/sys/class/thermal/thermal_zone0/temp";
    }
    if(config["updateInterval"] && config["updateInterval"] > 0) {
        this.updateInterval = config["updateInterval"];
    } else {
        this.updateInterval = null;
    }
  
	this.setUpServices();
};

RaspberryPiInfo.prototype.getUptime = function (callback) {
	
	var data = fs.readFileSync("/tmp/uptime.txt", "utf-8");
	var uptime = data.substring(12, data.indexOf(",", data.indexOf(",", 0)+1));
		
	callback(null, uptime);
};

RaspberryPiInfo.prototype.getAvgLoad = function (callback) {
	
	var data = fs.readFileSync("/tmp/uptime.txt", "utf-8");
	var load = data.substring(data.length - 17);
		
	callback(null, load);
};

RaspberryPiInfo.prototype.setUpServices = function () {

	var that = this;
	var temp;
	
	this.infoService = new Service.AccessoryInformation();
	this.infoService
		.setCharacteristic(Characteristic.Manufacturer, "RaspberryPi")
		.setCharacteristic(Characteristic.Model, "3B")
		.setCharacteristic(Characteristic.SerialNumber, hostname + "-" + this.name)
		.setCharacteristic(Characteristic.FirmwareRevision, packageFile.version);
	
	this.fakeGatoHistoryService = new FakeGatoHistoryService("weather", this, { storage: 'fs' });
	
	let uuid1 = UUIDGen.generate(that.name + '-Uptime');
	info = function (displayName, subtype) {
		Characteristic.call(this, 'Uptime', uuid1);
		this.setProps({
			format: Characteristic.Formats.STRING,
			perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
		});
		this.value = this.getDefaultValue();
	};
	inherits(info, Characteristic);
	info.UUID = uuid1;

	let uuid2 = UUIDGen.generate(that.name + '-AvgLoad');
	load = function () {
		Characteristic.call(this, 'Average Load', uuid2);
		this.setProps({
			format: Characteristic.Formats.STRING,
			perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
		});
		this.value = this.getDefaultValue();
	};
	inherits(load, Characteristic);
	load.UUID = uuid2;
	
	this.raspberrypiService = new Service.TemperatureSensor(that.name);
	var currentTemperatureCharacteristic = this.raspberrypiService.getCharacteristic(Characteristic.CurrentTemperature);
	this.raspberrypiService.getCharacteristic(info)
		.on('get', this.getUptime.bind(this));
	this.raspberrypiService.getCharacteristic(load)
		.on('get', this.getAvgLoad.bind(this));
	
	function getCurrentTemperature() {
		var data = fs.readFileSync(that.readFile, "utf-8");
		var temperatureVal = parseFloat(data) / 1000;
		temp = temperatureVal;

		return temperatureVal;
	}
	
	readUptime();
	
	currentTemperatureCharacteristic.updateValue(getCurrentTemperature());
	if(that.updateInterval) {
		setInterval(() => {
			currentTemperatureCharacteristic.updateValue(getCurrentTemperature());
			
			that.log("Raspberry Temperatur: " + temp);
			this.fakeGatoHistoryService.addEntry({time: new Date().getTime() / 1000, temp: temp});
			
			readUptime();
			
		}, that.updateInterval);
	}
	
	currentTemperatureCharacteristic.on('get', (callback) => {
		callback(null, getCurrentTemperature());
	});
}

RaspberryPiInfo.prototype.getServices = function () {

	return [this.infoService, this.fakeGatoHistoryService, this.raspberrypiService];
};
