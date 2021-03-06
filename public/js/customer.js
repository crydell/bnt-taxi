/*jslint es5:true, indent: 2 */
/*global Vue, io */
/* exported vm */
'use strict';
var socket = io();

var vm = new Vue({
    el: '#page',
    data: {
	name: generateName(),
	customerId: null,
	orderId: null,
	map: null,
	fromMarker: null,
	destMarker: null,
	connectMarkers: null,
	taxiMarkers: {},
	chatLog: {},
	requestButton: false,
	showingMore: false,
	currentState: 'ordering',
	assignedTrip: {},
	lastDriver: null
    },
    created: function () {
	socket.on('initialize', function (data) {
	    // add taxi markers in the map for all taxis
	    for (var taxiId in data.taxis) {
		this.taxiMarkers[taxiId] = this.putTaxiMarker(data.taxis[taxiId]);
	    }
	}.bind(this));
	socket.on('orderId', function (orderId) {
	    this.orderId = orderId;
	}.bind(this));
	
	socket.on('taxiAdded', function (taxi) {
	    this.taxiMarkers[taxi.taxiId] = this.putTaxiMarker(taxi);
	}.bind(this));

	socket.on('taxiMoved', function (taxi) {
	    this.taxiMarkers[taxi.taxiId].setLatLng(taxi.latLong);
            if ((this.currentState == 'waiting'
		 || this.currentState == 'arrived'
		 || this.currentState == 'travelling')
		&& taxi.taxiId == this.assignedTrip.taxi.taxiId) {
		this.map.setView(taxi.latLong);
		
		if (this.currentState == 'travelling') {
                    this.connectMarkers.setLatLngs([taxi.latLong, this.destMarker.getLatLng()], {color: 'blue'});            
		}
            }
	}.bind(this));

	socket.on('taxiQuit', function (taxiId) {
	    this.map.removeLayer(this.taxiMarkers[taxiId]);
	    Vue.delete(this.taxiMarkers, taxiId);
	}.bind(this));

	/*
	  socket.on('tripAssigned', function (trip) {
	  if (trip.order == this.orderId){
	  this.currentState = 'waiting';
	  }
	  }.bind(this));
	*/

	socket.on('tripAssigned', function (trip) {
	    if (trip.order.orderId == this.orderId){
		this.assignedTrip = trip;
	    }
	}.bind(this));

	socket.on('driverResponse', function (trip) {
	    if (trip.order.orderId == this.orderId && trip.driverAccept){
		this.assignedTrip = trip;
		this.currentState = 'responding';
	    }
	    else {
		this.assignedTrip = {};
	    }
	}.bind(this));

	socket.on('chatMessageSent', function(message) {
	    if (this.orderId == message.order.orderId){
		var tmp = this.chatLog;
		tmp[message.messageId] = message;
		this.chatLog = {};
		this.chatLog = tmp;
	    }
	}.bind(this));


	socket.on('driverWaiting', function (trip) {
	    if (trip.order.orderId == this.orderId){
		this.currentState = 'arrived';
	    }
	}.bind(this));

	socket.on('tripBegin', function (trip) {
	    if (trip.order.orderId == this.orderId){
		this.currentState = 'travelling';
		this.map.removeLayer(this.fromMarker);
	    }
	}.bind(this));

	socket.on('tripCompleted', function (trip) {
	    if (trip.order.orderId == this.orderId){
		this.currentState = 'rating';

		this.assignedTrip = {};
		this.chatLog = {};
		this.lastDriver = trip.taxi.taxiId;
		
		this.map.removeLayer(this.destMarker);
		this.destMarker = null;
		
		this.map.removeLayer(this.connectMarkers);
		this.connectMarkers = null;
	    }
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

	
	//Helper function, should probably not be here
	function getRandomInt(min, max) {
	    min = Math.ceil(min);
	    max = Math.floor(max);
	    return Math.floor(Math.random() * (max - min)) + min;
	}
	this.customerId = getRandomInt(1, 1000000);
    },
    mounted: function () {
	// set up the map
	this.map = L.map('my-map').setView([59.8415,17.648], 13);
	this.map.removeControl(this.map.zoomControl);
	// create the tile layer with correct attribution
	var osmUrl='http://{s}.tile.osm.org/{z}/{x}/{y}.png';
	var osmAttrib='Map data © <a href="http://openstreetmap.org">OpenStreetMap</a> contributors';
	L.tileLayer(osmUrl, {
            attribution: osmAttrib,
            maxZoom: 18
	}).addTo(this.map);

	var orderControl = L.Control.extend({
	    options: {
		position: 'topleft' 
	    },

	    onAdd: function (map) {
		var container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom orderButton'); 
		return container;
	    }
	});
	
	var topLeftControl = L.Control.extend({
	    options: {
		position: 'topleft' 
	    },

	    onAdd: function (map) {
		var container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom orderButton'); 
		return container;
	    }
	});
	
	this.requestButton = new topLeftControl();
	
	var searchDestControl = L.esri.Geocoding.geosearch({
            allowMultipleResults: false, 
            zoomToResult: false, 
            placeholder: "Where do you want to go?",
            expanded: true,
            collapseAfterResult: false,
            position: 'topleft',
            useMapBounds: false,
            searchBounds: [[63.431, 10.392], [56.508, 21.011]]
        }
							  );
	
	var searchFromControl = L.esri.Geocoding.geosearch({
            allowMultipleResults: false, 
            zoomToResult: false, 
            placeholder: "Where are you?",
            expanded: true,
            collapseAfterResult: false,
            position: 'topleft',
            useMapBounds: false,
            searchBounds: [[63.431, 10.392], [56.508, 21.011]]
        }
							  );
	
	this.map.addControl(searchFromControl);
	this.map.addControl(searchDestControl);      

	var myLocationButton = new orderControl();
	this.map.addControl(myLocationButton);
	
	var container = searchFromControl.getContainer();
	
	container.classList.add("location-input");
	container.id = "search-from";
	container.firstChild.classList.add("searchFrom");
	document.getElementById('map-search-area').appendChild(container);

	container = searchDestControl.getContainer();
	
	container.id = "search-dest";
	container.classList.add("location-input");
	container.firstChild.classList.add("searchDest");
	document.getElementById('map-search-area').appendChild(container);

	
	container = myLocationButton.getContainer();
	
	container.id = "my-location-button";
	container.innerHTML += "My location";
	container.onclick = this.setMyLocation;
	document.getElementById('map-search-area').appendChild(container);
	
	document.getElementsByClassName("searchFrom")[0].onfocus = function () {
            this.requestButton = false;
            if (this.fromMarker != null) {            
		this.map.removeLayer(this.fromMarker);
            }
            
            this.fromMarker = null;
            
            if (this.connectMarkers != null) {
		this.map.removeLayer(this.connectMarkers);            
            }
            
            this.connectMarkers = null;
	}.bind(this); 
	
	document.getElementsByClassName("searchDest")[0].onfocus = function () {
            this.requestButton = false;
            if (this.destMarker != null) {            
		this.map.removeLayer(this.destMarker);
            }
            
            this.destMarker = null;
            
            if (this.connectMarkers != null) {
		this.map.removeLayer(this.connectMarkers);            
            }
            
            this.connectMarkers = null;
	}.bind(this); 
	
	searchFromControl.on("results", function(data) {
            this.handleFromMarker(data);
	}.bind(this));
	
	searchDestControl.on("results", function(data) {
            this.handleDestMarker(data);
	}.bind(this));
    },
    methods: {
	putTaxiMarker: function (taxi) {
	    var marker = L.marker(taxi.latLong, {icon: this.taxiIcon}).addTo(this.map);
	    marker.bindPopup("Taxi " + taxi.taxiId);
	    marker.taxiId = taxi.taxiId;
	    return marker;
	},
	getOrderItems: function() {
	    var form = document.getElementById("additional-form");
	    var data = new FormData(form);
	    var dataobj = {};

	    for (const [key, value] of data.entries()){
		dataobj[key] = value;
	    }
	    
	    return dataobj;
	},
	
	orderTaxi: function() {
	    this.currentState = 'assigning';
	    this.requestButton = false;
	    this.toggleSearch();
            socket.emit("orderTaxi", {
		name: this.name,
		customerId: this.customerId,
		fromLatLong: [this.fromMarker.getLatLng().lat, this.fromMarker.getLatLng().lng],
                destLatLong: [this.destMarker.getLatLng().lat, this.destMarker.getLatLng().lng],
                orderItems: this.getOrderItems(),
		timeJoined: new Date().getTime()
            });
	},
	toggleSearch: function() {
	    var search = document.getElementById('map-search-area');
	    search.style.display = search.style.display != 'none' ? 'none' : 'inline';
	},
	moveMarker: function (event) {
            if (this.fromMarker == null || this.destMarker == null) return;
            this.connectMarkers.setLatLngs([this.fromMarker.getLatLng(), this.destMarker.getLatLng()], {color: 'blue'});
	},
	handleFromMarker: function (event) {
            if (this.fromMarker == null) {
		this.fromMarker = L.marker(event.latlng, {icon: this.fromIcon}).addTo(this.map);
		this.fromMarker.on("drag", this.moveMarker);
		if (this.destMarker != null) {
                    this.connectMarkers = L.polyline([this.fromMarker.getLatLng(), this.destMarker.getLatLng()], {color: 'blue'}).addTo(this.map);   
                    this.map.flyToBounds([this.fromMarker.getLatLng(), this.destMarker.getLatLng()], {paddingTopLeft: [100, 100]});
                    this.addRequestButton();
		}
            } else {
		this.fromMarker.setLatLng(event.latlng);
		this.moveMarker();
		this.map.flyToBounds([this.fromMarker.getLatLng(), this.destMarker.getLatLng()], {paddingTopLeft: [100, 100]}); 
            }
            document.getElementsByClassName("searchFrom")[0].placeholder = event.text;
	},
	handleDestMarker: function (event) {
            if (this.destMarker == null) {
		this.destMarker = L.marker(event.latlng, {draggable: true}).addTo(this.map);
		this.destMarker.on("drag", this.moveMarker);
		if (this.fromMarker != null) {
                    this.connectMarkers = L.polyline([this.fromMarker.getLatLng(), this.destMarker.getLatLng()], {color: 'blue'}).addTo(this.map);   
                    this.map.flyToBounds([this.fromMarker.getLatLng(), this.destMarker.getLatLng()], {paddingTopLeft: [100, 100]});
                    this.addRequestButton();
		}
            } else {
		this.destMarker.setLatLng(event.latlng);
		this.moveMarker();
		this.map.flyToBounds([this.fromMarker.getLatLng(), this.destMarker.getLatLng()], {paddingTopLeft: [100, 100]});
            }
            document.getElementsByClassName("searchDest")[0].placeholder = event.text;
	},
	setMyLocation: function (event) {
            this.handleFromMarker( {latlng: L.latLng(59.84092, 17.64728), text: "Polacksbacken"});
	},
	addRequestButton: function (event) {
	    this.requestButton = true;
	},
	cancelTrip: function () {
	    socket.emit("tripCancelled", {
		assigned: this.assignedTrip.tripId != undefined,
		orderId: this.orderId,
		trip: this.assignedTrip
	    });
	    this.toggleSearch();
	    this.assignedTrip = {};
	    this.currentState = "ordering";
	    this.chatLog = {};
	    
	    this.map.removeLayer(this.destMarker);
	    this.destMarker = null;
	    
	    this.map.removeLayer(this.connectMarkers);
	    this.connectMarkers = null;

	},
	respondToTripRequest: function (response) {
	    this.assignedTrip.customerAccept = response;
	    socket.emit("customerResponse", this.assignedTrip);
	    
	    if (!response) {
		this.currentState = 'assigning';
		this.assignedTrip = {};
	    } else {
		this.currentState = 'waiting';
	    }
	},
	sendChatMessage: function (msg) {
	    socket.emit("chatMessageSent",
			{
			    messageId: new Date(),
			    sender: this.name,
			    taxi: this.assignedTrip.taxi,
			    order: this.assignedTrip.order,
			    message: document.getElementById('messageField').value,
			    timeSent: formatTime(new Date())});
	    document.getElementById('messageField').value = "";
	},
	giveRating: function (rating) {
	    if (rating != 0){
		socket.emit("giveRating",
			    {forCustomer: false,
			     taxiId: this.lastDriver,
			     rating: rating});
	    }
	    this.currentState = 'thanking';
	    setTimeout(function(){this.currentState = 'ordering'; this.toggleSearch()}.bind(this), 5000);
	}

    }
});
