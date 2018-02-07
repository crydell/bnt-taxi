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
    taxiMarkers: {}
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
    this.map.on('move', this.handleMove);
    this.fromMarker = L.marker(this.map.getCenter(), {icon: this.fromIcon}).addTo(this.map);

    var orderControl = L.Control.extend({
      options: {
        position: 'topright' 
      },

      onAdd: function (map) {
          var container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom orderButton'); 
          container.style.backgroundColor = 'white';

          return container;
      }
    });
      
    var orderButton = new orderControl();
    this.map.addControl(orderButton); 
    orderButton.getContainer().onclick = this.orderTaxi;
      
    var searchDestControl = L.esri.Geocoding.geosearch({
            allowMultipleResults: false, 
            zoomToResult: false, 
            placeholder: "Where do you want to go?",
            expanded: true,
            collapseAfterResult: false,
            position: 'topright'
        }
    ).addTo(this.map);
      
    var mapHalfHeight = this.map.getSize().y / 2;
    var mapHalfWidth = this.map.getSize().x / 2;
    var container = searchDestControl.getContainer();
    var containerHalfHeight = parseInt(container.offsetHeight / 2);
    var containerHalfWidth = parseInt(container.offsetWidth / 2);
      
    var containerTop = 0 - containerHalfHeight + 'px';

    container.style.position = 'absolute';
    container.style.top = "50px";
    container.style.right = mapHalfWidth - containerHalfWidth + 'px';
    
    var orderButtonWidth = mapHalfWidth / 2;
    orderButton.getContainer().style.width = orderButtonWidth + 'px';
    orderButton.getContainer().style.height = mapHalfHeight / 10 + 'px';  
    orderButton.getContainer().style.right = mapHalfWidth - (orderButtonWidth / 2) + 'px';
    orderButton.getContainer().style.top = 1.7 * mapHalfHeight + "px"; 
    orderButton.getContainer().innerHTML += "Order taxi";
      
    searchDestControl.on("results", function(data) {
        if (this.destMarker == null) {
            this.destMarker = L.marker(data.latlng, {draggable: true}).addTo(this.map);
            this.destMarker.on("drag", this.moveMarker);
            if (this.fromMarker != null) {
                this.connectMarkers = L.polyline([this.fromMarker.getLatLng(), this.destMarker.getLatLng()], {color: 'blue'}).addTo(this.map);   
            }
        } else {
            this.destMarker.setLatLng(data.latlng);
            this.moveMarker();
        }
        
    }.bind(this));
  },
  methods: {
    putTaxiMarker: function (taxi) {
      var marker = L.marker(taxi.latLong, {icon: this.taxiIcon}).addTo(this.map);
      marker.bindPopup("Taxi " + taxi.taxiId);
      marker.taxiId = taxi.taxiId;
      return marker;
    },
    orderTaxi: function() {
            socket.emit("orderTaxi", { fromLatLong: [this.fromMarker.getLatLng().lat, this.fromMarker.getLatLng().lng],
                                       destLatLong: [this.destMarker.getLatLng().lat, this.destMarker.getLatLng().lng],
                                       orderItems: { passengers: 1, bags: 1, animals: "doge" }
                                     });
    },
    handleMove: function (event) {
        this.fromMarker.setLatLng(this.map.getCenter());  
        this.moveMarker();
    },
    moveMarker: function (event) {
        if (this.fromMarker == null || this.destMarker == null) return;
        this.connectMarkers.setLatLngs([this.fromMarker.getLatLng(), this.destMarker.getLatLng()], {color: 'blue'});
    }   
  }
});
