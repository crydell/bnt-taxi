/*jslint node: true */
/* eslint-env node */
'use strict';

// Require express, socket.io, and vue
var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var path = require('path');
 
// Pick arbitrary port for server
var port = 3000;
app.set('port', (process.env.PORT || port));

// Serve static assets from public/
app.use(express.static(path.join(__dirname, 'public/')));
// Serve vue from node_modules as vue/
app.use('/vue', express.static(path.join(__dirname, '/node_modules/vue/dist/')));
// Serve leaflet from node_modules as leflet/
app.use('/leaflet', express.static(path.join(__dirname, '/node_modules/leaflet/dist/')));
// Serve esri leaflet geocoder from node_modules as esri-leaflet/
app.use('/esri-leaflet', express.static(path.join(__dirname, '/node_modules/esri-leaflet/dist/')));
// Serve esri leaflet geocoder from node_modules as esri-leaflet-geocoder/
app.use('/esri-leaflet-geocoder', express.static(path.join(__dirname, '/node_modules/esri-leaflet-geocoder/dist/')));
// Serve index.html directly as root page
app.get('/', function (req, res) {
  res.sendFile(path.join(__dirname, 'views/customer.html'));
});
// Serve driver.html as /driver
app.get('/driver', function (req, res) {
  res.sendFile(path.join(__dirname, 'views/driver.html'));
});
// Serve dispatcher.html as /dispatcher
app.get('/dispatcher', function (req, res) {
  res.sendFile(path.join(__dirname, 'views/dispatcher.html'));
});

// Store data in an object to keep the global namespace clean and 
// prepare for multiple instances of data if necessary
function Data() {
    this.orders = {};
    this.taxis = {};
    this.trips = {};
    this.currentOrderNumber = 1000;
    this.currentTripNumber = 1000;
}


Data.prototype.getOrderNumber = function () {
    this.currentOrderNumber += 1;
    return this.currentOrderNumber;
}

/*
  Adds an order to to the queue
*/
Data.prototype.addOrder = function (order) {
    var orderId = this.getOrderNumber();
    //Store the order in an "associative array" with orderId as key
    this.orders[orderId] = order;
    return orderId;
};

/*
  Just deleting the order when it's finished
*/
Data.prototype.finishOrder = function (orderId) {
    delete this.orders[orderId];
};

/*
  Only needs to know orderId. The rest is up to the client to decide 
*/
Data.prototype.updateOrderDetails = function (order) {
    for (var key in order) {
	this.orders[order.orderId][key] = order[key];
    }
};

Data.prototype.getAllOrders = function () {
    return this.orders;
};

Data.prototype.addTaxi = function (taxi) {
    //Store the order in an "associative array" with orderId as key
    this.taxis[taxi.taxiId] = taxi;
};

Data.prototype.updateTaxiDetails = function (taxi) {
    for (var key in taxi) {
	this.taxis[taxi.taxiId][key] = taxi[key];
    }
};

Data.prototype.removeTaxi = function (taxiId) {
    delete this.taxis[taxiId];
};

Data.prototype.getAllTaxis = function () {
    return this.taxis;
};


Data.prototype.getTripNumber = function () {
    this.currentTripNumber += 1;
    return this.currentTripNumber;
}

Data.prototype.addTrip = function (trip) {
    var tripId = this.getTripNumber();
    //Store the trip in an "associative array" with tripId as key
    this.trips[tripId] = trip;
    return tripId;
};

/*
  Just deleting the trip when it's finished
*/
Data.prototype.finishTrip = function (tripId) {
    delete this.trips[tripId];
};

/*
  Only needs to know tripId. The rest is up to the client to decide 
*/
Data.prototype.updateTripDetails = function (trip) {
    for (var key in trip) {
	this.trips[trip.tripId][key] = trip[key];
    }
};

Data.prototype.getAllTrips = function () {
    return this.trips;
};

var data = new Data();

io.on('connection', function (socket) {
    // Send list of orders when a client connects
    socket.emit('initialize', { orders: data.getAllOrders(),
				taxis: data.getAllTaxis(),
				trips: data.getAllTrips()});
    // Add a listener for when a connected client emits an "orderTaxi" message
    socket.on('orderTaxi', function (order) {
	var orderId = data.addOrder(order);
	order.orderId = orderId;
	// send updated info to all connected clients, note the use of "io" instead of "socket"
	io.emit('taxiOrdered', order);
	// send the orderId back to the customer who ordered
	socket.emit('orderId', orderId);
    });
    socket.on('addTaxi', function (taxi) {
	data.addTaxi(taxi);
	// send updated info to all connected clients, note the use of io instead of socket
	io.emit('taxiAdded', taxi);
    });
    socket.on('moveTaxi', function (taxi) {
	data.updateTaxiDetails(taxi);
	// send updated info to all connected clients, note the use of io instead of socket
	io.emit('taxiMoved', taxi);
    });
    socket.on('taxiQuit', function (taxi) {
	data.removeTaxi(taxi);
	console.log("Taxi",taxi,"has left the job");
	// send updated info to all connected clients, note the use of io instead of socket
	io.emit('taxiQuit', taxi);
    });
    socket.on('finishOrder', function (orderId) {
	data.finishOrder(orderId);
	// send updated info to all connected clients, note the use of io instead of socket
	io.emit('orderFinished', orderId);
    });

    socket.on('taxiAssigned', function(order) {
	data.updateOrderDetails(order);
	io.emit('currentQueue', { orders: data.getAllOrders() });
    });

    socket.on('orderAccepted', function(order) {
	data.updateOrderDetails(order);
	io.emit('orderAccepted', order );
    });

    
    socket.on('tripAssigned', function(trip) {
	var tripId = data.addTrip(trip);
	trip.tripId = tripId;
	io.emit('tripAssigned', trip);
	io.emit('currentTrips', { trips: data.getAllTrips()});
    });
    
    socket.on('driverResponse', function(trip) {
	data.updateTripDetails(trip);
	if (!trip.driverAccept){
	    data.finishTrip(trip.tripId);
	}
	io.emit('driverResponse', trip);
	io.emit('currentTrips', { trips: data.getAllTrips()});
    });

    socket.on('customerResponse', function(trip) {
	data.updateTripDetails(trip);
	if (!trip.customerAccept) {
	    data.finishTrip(trip.tripId);
	}
	io.emit('customerResponse', trip);
	io.emit('currentTrips', { trips: data.getAllTrips()});
    });

    socket.on('driverWaiting', function(trip) {
	io.emit('driverWaiting', trip);
    });

    socket.on('tripBegin', function(trip) {
	io.emit('tripBegin', trip);
    });

    socket.on('tripCompleted', function(trip) {
	data.finishTrip(trip.tripId);
	data.finishOrder(trip.order.orderId);
	io.emit('tripCompleted', trip);
	io.emit('currentTrips', { trips: data.getAllTrips()});
	io.emit('currentQueue', { orders: data.getAllOrders() });
    });
});

var server = http.listen(app.get('port'), function () {
  console.log('Server listening on port ' + app.get('port'));
});
