/*jslint es5:true, indent: 2 */
/*global Vue, io */
/* exported vm */
'use strict';
var socket = io();

var vm = new Vue({
  el: '#page',
  data: {
    orders: {},
    taxis: {},
    customerMarkers: {},
    taxiMarkers: {}
  },

  created: function () {
    socket.on('initialize', function (data) {
      this.orders = data.orders;
      this.taxis = data.taxis;
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
    assignTaxi: function (order) {
      socket.emit("taxiAssigned", order);
    }
  }
});
