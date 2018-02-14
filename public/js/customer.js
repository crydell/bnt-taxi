/*jslint es5:true, indent: 2 */
/*global Vue, io */
/* exported vm */
'use strict';
var socket = io();

var vm = new Vue({
  el: '#page',
  data: {
    orderId: null,
    map: null,
    fromMarker: null,
    destMarker: null,
    taxiMarkers: {},
      requestButton: false,
      showingMore: false,
      currentState: 'ordering'
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
    }.bind(this));

    socket.on('taxiQuit', function (taxiId) {
      this.map.removeLayer(this.taxiMarkers[taxiId]);
      Vue.delete(this.taxiMarkers, taxiId);
    }.bind(this));

      
      socket.on('tripAssigned', function (trip) {
	  if (trip.order == this.orderId){
	      this.currentState = 'waiting';
	  }
      }.bind(this));

      socket.on('driverWaiting', function (trip) {
	  if (trip.order == this.orderId){
	      this.currentState = 'travelling';
	  }
      }.bind(this));

      socket.on('tripCompleted', function (trip) {
	  if (trip.order == this.orderId){
	      this.currentState = 'thanking';
	      setTimeout(function(){this.currentState = 'ordering'; this.toggleSearch()}.bind(this), 5000);
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
//    this.map.on('move', this.handleMove);
//    this.fromMarker = L.marker(this.map.getCenter(), {icon: this.fromIcon}).addTo(this.map);

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
            useMapBounds: false
        }
    );
      
    var searchFromControl = L.esri.Geocoding.geosearch({
            allowMultipleResults: false, 
            zoomToResult: false, 
            placeholder: "Where are you?",
            expanded: true,
            collapseAfterResult: false,
            position: 'topleft',
            useMapBounds: false
        }
    );

    this.map.addControl(searchDestControl);      
    this.map.addControl(searchFromControl);

    var myLocationButton = new orderControl();
    this.map.addControl(myLocationButton);

    myLocationButton.getContainer().id = "my-location-button";
    myLocationButton.getContainer().innerHTML += "My location";
    myLocationButton.getContainer().onclick = this.setMyLocation;
      
    var container = searchDestControl.getContainer();

      container.id = "search-dest";
      container.classList.add("location-input");
      container.firstChild.classList.add("searchDest");
      
      searchFromControl.getContainer().classList.add("location-input");
      searchFromControl.getContainer().id = "search-from";
      searchFromControl.getContainer().firstChild.classList.add("searchFrom");
      
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
            socket.emit("orderTaxi", { fromLatLong: [this.fromMarker.getLatLng().lat, this.fromMarker.getLatLng().lng],
                                       destLatLong: [this.destMarker.getLatLng().lat, this.destMarker.getLatLng().lng],
                                       orderItems: this.getOrderItems()
                                     });
      },
      toggleSearch: function() {
	  var search = document.getElementsByClassName("leaflet-top")[0];
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
    }
  }
});
