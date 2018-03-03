/*jslint es5:true, indent: 2 */
/*global Vue, io */
/* exported vm */
'use strict';
var socket = io();

var vm = new Vue({
    el: '#page',
    data: {
	selectedOrder: null,
	selectedTaxi: null,
	selectedTrip: null,
	currentAssignmentMenu: "orders",
	orders: {},
	taxis: {},
	trips: {},
	customerMarkers: {},
	taxiMarkers: {}
    },

    created: function () {
	socket.on('initialize', function (data) {
	    this.orders = data.orders;
	    this.taxis = data.taxis;
	    this.trips = data.trips;
	    // add markers in the map for all orders
	    for (var orderId in data.orders) {
		this.customerMarkers[orderId] = this.putCustomerMarkers(data.orders[orderId]);
	    }
	    // add taxi markers in the map for all taxis
	    for (var taxiId in data.taxis) {
		this.taxiMarkers[taxiId] = this.putTaxiMarker(data.taxis[taxiId]);
	    }
	}.bind(this));

	socket.on('taxiAdded', function (taxi) {
	    this.$set(this.taxis, taxi.taxiId, taxi);
	    this.taxiMarkers[taxi.taxiId] = this.putTaxiMarker(taxi);
	}.bind(this));

	socket.on('taxiMoved', function (taxi) {
	    this.taxis[taxi.taxiId].latLong = taxi.latLong;
	    this.taxiMarkers[taxi.taxiId].setLatLng(taxi.latLong);
	}.bind(this));

	socket.on('taxiQuit', function (taxiId) {
	    Vue.delete(this.taxis, taxiId);
	    this.map.removeLayer(this.taxiMarkers[taxiId]);
	    Vue.delete(this.taxiMarkers, taxiId);
	}.bind(this));
	
	socket.on('currentQueue', function (data) {
	    this.orders = data.orders;
	    this.customerMarkers = null; // Not reactive yet
	    for (var orderId in data.orders) {
		this.customerMarkers[orderId] = this.putCustomerMarkers(data.orders[orderId]);
	    }
	}.bind(this));

	socket.on('taxiOrdered', function (order) {
	    this.$set(this.orders, order.orderId, order);
	    this.customerMarkers[order.orderId] = this.putCustomerMarkers(order);
	}.bind(this));
	socket.on('orderAccepted', function (order) {
	    this.$set(this.orders, order.orderId, order);
	}.bind(this));
	socket.on('orderFinished', function (orderId) {
	    Vue.delete(this.orders, orderId);
	    this.map.removeLayer(this.customerMarkers[orderId].from);
	    this.map.removeLayer(this.customerMarkers[orderId].dest);
	    this.map.removeLayer(this.customerMarkers[orderId].line);
	    Vue.delete(this.customerMarkers, orderId);
	}.bind(this));

	socket.on('currentTrips', function (currentTrips) {
	    this.trips = currentTrips.trips;
	}.bind(this));


	// These icons are not reactive
	this.taxiIcon = L.icon({
	    iconUrl: "img/taxi.png",
	    iconSize: [36,36],
	    iconAnchor: [18,36],
	    popupAnchor: [0,-36]
	});

	this.fromIcon = L.icon({
            iconUrl: "img/customer.png",
            iconSize: [36,50],
            iconAnchor: [19,50]
        });

    },
    mounted: function () {
	// set up the map
	this.map = L.map('my-map').setView([59.8415,17.648], 11);

	// create the tile layer with correct attribution
	var osmUrl='http://{s}.tile.osm.org/{z}/{x}/{y}.png';
	var osmAttrib='Map data © <a href="http://openstreetmap.org">OpenStreetMap</a> contributors';
	L.tileLayer(osmUrl, {
            attribution: osmAttrib,
            maxZoom: 18
	}).addTo(this.map);
    },
    methods: {
	createPopup: function (orderId, items) {
	    var popup = document.createElement('div');
	    popup.appendChild(document.createTextNode('Order ' + orderId));
	    var list = document.createElement('ul');
	    list.classList.add('popup-list');
	    for (var i in items) {
		var listItem = document.createElement('li');
		var listItemText = document.createTextNode(i + ": " + items[i]);
		listItem.appendChild(listItemText);
		list.appendChild(listItem);
	    }
	    popup.appendChild(list);
	    return popup;
	},
	putTaxiMarker: function (taxi) {
	    var marker = L.marker(taxi.latLong, {icon: this.taxiIcon}).addTo(this.map);
	    marker.bindPopup("Taxi " + taxi.taxiId);
	    marker.taxiId = taxi.taxiId;
	    return marker;
	},
	putCustomerMarkers: function (order) {
	    var fromMarker = L.marker(order.fromLatLong, {icon: this.fromIcon}).addTo(this.map);
	    fromMarker.bindPopup(this.createPopup(order.orderId, order.orderItems));
	    fromMarker.orderId = order.orderId;
	    var destMarker = L.marker(order.destLatLong).addTo(this.map);
	    destMarker.bindPopup(this.createPopup(order.orderId, order.orderItems));
	    destMarker.orderId = order.orderId;
	    var connectMarkers = L.polyline([order.fromLatLong, order.destLatLong], {color: 'blue'}).addTo(this.map);
	    return {from: fromMarker, dest: destMarker, line: connectMarkers};
	},

	ordersLength: function () {
	    var length = 0;

	    for (var order in this.orders) {
		if (!this.orderIsAssigned(this.orders[order])){
		    length++;
		}
	    }

	    return length;
	},

	taxisLength: function () {
	    var length = 0;

	    for (var taxi in this.taxis) {
		if (!this.taxiIsAssigned(this.taxis[taxi])){
		    length++;
		}
	    }

	    return length;
	},
	
	assignTaxi: function (order, taxi) {
	    socket.emit("tripAssigned", {
		order: order,
		taxi: taxi,
		driverAccept: false,
		customerAccept: false});
	},

	orderIsPending: function(order) {
	    for (var trip in this.trips) {
		if (this.trips[trip].order.orderId == order.orderId
		    && !this.trips[trip].customerAccept){
		    return true;
		}
	    }
	    
	    return false;
	},

	taxiIsPending: function(taxi) {
	    for (var trip in this.trips) {
		if (this.trips[trip].taxi.taxiId == taxi.taxiId
		    && !this.trips[trip].driverAccept){
		    return true;
		}
	    }
	    
	    return false;
	},

	orderIsAssigned: function(order) {
	    for (var trip in this.trips) {
		if (this.trips[trip].order.orderId == order.orderId
		    && this.trips[trip].customerAccept){
		    return true;
		}
	    }
	    
	    return false;
	},

	taxiIsAssigned: function(taxi) {
	    for (var trip in this.trips) {
		if (this.trips[trip].taxi.taxiId == taxi.taxiId
		    && this.trips[trip].driverAccept){
		    return true;
		}
	    }
	    
	    return false;
	},

	kilometerDistance: function(lat1, long1, lat2, long2) {
	    lat1 = Math.PI * lat1 / 180;
	    lat2 = Math.PI * lat2 / 180;
	    long1 = Math.PI * long1 / 180;
	    long2 = Math.PI * long2 / 180;
	    var angle = Math.acos(
		(Math.sin(lat1) * Math.sin(lat2)) +
		    (Math.cos(lat1) * Math.cos(lat2) * Math.cos(Math.abs(long1 - long2))));
	    var distance = 6371 * angle;
	    return distance;
	},

	minutesSince: function(time) {
	    var currentTime = new Date();
	    var msSince = currentTime - time;
	    return Math.round(msSince/1000/60);
	}
    }
});
