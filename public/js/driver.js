/*jslint es5:true, indent: 2 */
/*global Vue, io */
/* exported vm */
'use strict';
var socket = io();

var vm = new Vue({
    el: '#page',
    data: {
	map: null,
	taxiId: 0,
	taxi: {}, 
	taxiLocation: null,
	orders: {},
	chatLog: {},
	customerMarkers: {},
	isAvailable: true,
      	assignedTrip: {},
	currentState: 'inactive'
    },
  created: function () {
    socket.on('initialize', function (data) {
      this.orders = data.orders;
    
      for(var orderId in data.orders) {
        this.customerMarkers[orderId] = this.putCustomerLocation(data.orders[orderId]);
      }
    }.bind(this));

    socket.on('currentQueue', function (data) {
      this.orders = data.orders;
    }.bind(this));

      socket.on('tripAssigned', function(trip) {
	  if (this.taxi.taxiId == trip.taxi.taxiId){
	      this.assignedTrip = trip;
	      this.currentState = 'responding';
	  }
      }.bind(this));

      socket.on('customerResponse', function(trip) {
	  if (this.taxi.taxiId == trip.taxi.taxiId){
	      if (trip.customerAccept) {
		  this.currentState = 'pickup';
	      }
	      else {
		  this.currentState = 'assigning';
		  this.assignedTrip = null;
	      }
	  }
      }.bind(this));


      socket.on('chatMessageSent', function(message) {
	  if (this.taxi.taxiId == message.taxi.taxiId){
	      console.log('received');
	      var tmp = this.chatLog;
	      tmp[message.messageId] = message;
	      this.chatLog = {}; // It works?
	      this.chatLog = tmp;
	  }
      }.bind(this));


      // this icon is not reactive
    this.taxiIcon = L.icon({
      iconUrl: "img/taxi.png",
      iconSize: [36,36],
      iconAnchor: [18,36]
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
    // It's probably not a good idea to generate a random taxi number, client-side. 
      this.taxi.taxiId = getRandomInt(1, 1000000);
      // Temporary solution so everything doesn't break, should still place the car manually
      this.taxi.latLong = [59.51301, 17.38425]; 
      this.taxi.name = generateName();
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
    this.map.on('click', this.setTaxiLocation);
  },
  beforeDestroy: function () {
    socket.emit('taxiQuit', this.taxi.taxiId);
  },
  methods: {
    setTaxiLocation: function (event) {
      if (this.taxiLocation === null) {
        this.taxiLocation = L.marker([event.latlng.lat, event.latlng.lng], {icon: this.taxiIcon, draggable: true}).addTo(this.map);
          this.taxiLocation.on("drag", this.moveTaxi);
	  this.taxi.latLong = [event.latlng.lat, event.latlng.lng];
      }
      else {
        this.taxiLocation.setLatLng(event.latlng);
        this.moveTaxi(event);
      }
    },

    putCustomerLocation: function (order){
      var fromMarker = L.marker(order.fromLatLong, {icon: this.fromIcon}).addTo(this.map);
      fromMarker.bindPopup(this.createPopup(order.orderId, order.orderItems));
      fromMarker.orderId = order.orderId;
      var destMarker = L.marker(order.destLatLong).addTo(this.map);
      destMarker.bindPopup(this.createPopup(order.orderId, order.orderItems));
      destMarker.orderId = order.orderId;
      

    },
      moveTaxi: function (event) {
	  if (this.currentState != 'inactive'){
	      socket.emit("moveTaxi", { taxiId: this.taxi.taxiId,
					latLong: [event.latlng.lat, event.latlng.lng]
				      });
	  }
    },
    quit: function () {
      socket.emit("taxiQuit", this.taxi.taxiId);
    },
    acceptOrder: function (order) {
        this.customerMarkers = this.putCustomerMarkers(order);
        order.taxiIdConfirmed = this.taxi.taxiId;
        socket.emit("orderAccepted", order);
    },
    finishOrder: function (orderId) {
      Vue.delete(this.orders, orderId);
      this.map.removeLayer(this.customerMarkers.from);
      this.map.removeLayer(this.customerMarkers.dest);
      this.map.removeLayer(this.customerMarkers.line);
      Vue.delete(this.customerMarkers);
      socket.emit("finishOrder", orderId);
    },
    putCustomerMarkers: function (order) {
      var fromMarker = L.marker(order.fromLatLong, {icon: this.fromIcon}).addTo(this.map);
      fromMarker.orderId = order.orderId;
      var destMarker = L.marker(order.destLatLong).addTo(this.map);
      destMarker.orderId = order.orderId;
      var connectMarkers = L.polyline([order.fromLatLong, order.destLatLong], {color: 'blue'}).addTo(this.map);
      return {from: fromMarker, dest: destMarker, line: connectMarkers};
    },
      
      toggleAvailable: function () {
	  if (this.currentState == 'inactive') {
	      this.currentState = 'assigning';
	      console.log("sending");
	      socket.emit("addTaxi", this.taxi);
	  }
	  else {
	      this.currentState = 'inactive';
	      this.quit();
	  }
      },
      
      respondToTripRequest: function (response) {
	  this.assignedTrip.driverAccept = response;
	  socket.emit("driverResponse", this.assignedTrip);
	  
	  if (!response) {
	      this.assignedTrip = null;
	      this.currentState = 'assigning';
	  }
	  else {
	      this.currentState = 'responded';
	  }
      },

      sendChatMessage: function (msg) {
	  socket.emit("chatMessageSent",
		      {
			  messageId: new Date(),
			  sender: this.taxi.name,
			  taxi: this.taxi,
			  order: this.assignedTrip.order,
			  message: document.getElementById('messageField').value,
			  timeSent: formatTime(new Date())});
	  document.getElementById('messageField').value = "";
      },
      
      markAtCustomer: function () {
	  socket.emit("driverWaiting", this.assignedTrip);
	  this.currentState = 'waiting';
      },
      markCustomerReady: function () {
	  socket.emit("tripBegin", this.assignedTrip);
	  this.currentState = 'driving';
      },
      markTripComplete: function () {
	  this.lastCustomer = this.assignedTrip.order.customerId;
	  socket.emit("tripCompleted", this.assignedTrip);
	  this.currentState = 'rating';
	  this.quit();
      },
      giveRating: function (rating) {
	  socket.emit("giveRating",
		      {forCustomer: true,
		       customerId: this.lastCustomer,
		       rating: rating});
	  this.currentState = 'inactive';
      }
  }
});
