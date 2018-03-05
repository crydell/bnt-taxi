var firstNames = ["Maria", "Anna", "Margareta", "Elisabeth", "Eva", "Kristina", "Birgitta", "Karin", "Elisabet", "Marie", "Ingrid", "Christina", "Linnéa", "Sofia", "Kerstin", "Marianne", "Lena", "Helena", "Emma", "Johanna", "Erik", "Lars", "Karl", "Anders", "Johan", "Per", "Nils", "Carl", "Mikael", "Jan", "Hans", "Lennart", "Olof", "Peter", "Gunnar", "Sven", "Fredrik", "Bengt", "Bo", "Daniel"];
var lastNames = ["Johansson", "Andersson", "Karlsson", "Nilsson", "Eriksson", "Larsson", "Olsson", "Persson", "Svensson", "Gustafsson", "Pettersson", "Jonsson", "Jansson", "Hansson", "Bengtsson", "Jönsson", "Carlsson", "Petersson", "Lindberg", "Magnusson"];

var generateName = function(){
    var firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    var lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
    
    return firstName + " " + lastName;
}

var formatTime = function(time){
    var hours = time.getHours();
    var minutes = time.getMinutes();

    hours = hours < 10 ? "0" + hours : hours;
    minutes = minutes < 10 ? "0" + minutes : minutes;

    return hours + ":" + minutes;
}
