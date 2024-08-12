var API = document.getElementById('API');
var baudrate = document.getElementById('baudrate');
var sendin = document.getElementById('sendin');
var recin = document.getElementById('recin');
var statsIn = document.getElementById('stats');
var subplotIn = document.getElementById('subplot');
var mixerIn = document.getElementById('mixin');
var engine = document.getElementById('engine');
var viewIn = document.getElementById('view');

var send_btn = document.getElementById('send');
var connect_btn = document.getElementById('connect');
var rtc_server_btn = document.getElementById('rtcserver');
var pause_btn = document.getElementById('pause');
var pause1_btn = document.getElementById('pause1');
var trash_btn = document.getElementById('trash');

var commandIn = document.getElementById('command');
var crIn = document.getElementById('cr');
var lfIn = document.getElementById('lf');
var watchIn = document.getElementById('watchin');
var write = document.getElementById('write');
var read = document.getElementById('read');
var skip = document.getElementById('skip');
var success = document.getElementById('success');
var error = document.getElementById('error');

var serialdiv  = document.getElementById('serialdiv');
var APIdiv     = document.getElementById('APIdiv');
var statsindiv = document.getElementById('statsindiv');
var watchindiv = document.getElementById('watchindiv');
var chartindiv = document.getElementById('chartindiv');
var ctrlindiv  = document.getElementById('ctrlindiv');
var commanddiv = document.getElementById('commanddiv');
var statsdiv   = document.getElementById('statsdiv');
var recdiv     = document.getElementById('recdiv');
var senddiv    = document.getElementById('senddiv');
var outputdiv  = document.getElementById('outputdiv');
var loggerdiv  = document.getElementById('loggerdiv');
var chartdiv   = document.getElementById('chartdiv');
var controlcnv = document.getElementById('controlcnv');
var speedocnv  = document.getElementById('speedocnv');
var buttondiv  = document.getElementById('buttondiv');
var enginediv  = document.getElementById('enginediv');

var view = 'log';
var lastClick = 0;
var previousProtocol = '';

window.addEventListener("load", function(event) {

  telemetry = new Telemetry();
  log = new Log(loggerdiv);
  graph = new Graph();
  control = new Control(controlcnv);
  speedo = new Speedo(speedocnv);
  serial = new Serial(10000);

  if( /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
    // if on Mobile phone, only Web Bluetooth API is available
    API.remove(API.selectedIndex);
    bauddiv.style.display = "none";

    if ('wakeLock' in navigator) {
      // Screen Wake Lock API supported, request lock to prevent screen from going to sleep when page is visible
      wakeLock = null;
      requestWakeLock();
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
  }else{
    // if on computer,remove Web Serial API if not available
    if ("serial" in navigator === false) {
      API.remove(API.selectedIndex);
      log.write('Web Serial API not supported. Enable experimental features.',2);
      log.write('chrome://flags/#enable-experimental-web-platform-features',2);
      log.write('opera://flags/#enable-experimental-web-platform-features',2);
      log.write('edge://flags/#enable-experimental-web-platform-features',2);  
    }
  }
  
  toggleMode();
  toggleAPI();
  toggleStats();
  toggleMixer();
  toggleSubplot();

  serial.setDisconnected()
  if (typeof(Worker)!=="undefined"){
    // Use webworker for interval to work even if tab is unfocused
    w = new Worker("js/timer.js");
    // Run Update
    w.onmessage = function (event) {
      update();
    };
  } else {
    // Web workers are not supported by your browser
    setInterval(update,50);
  }
});


async function handleVisibilityChange(){
  await requestWakeLock();
};

// Function that attempts to request a screen wake lock.
async function requestWakeLock(){
  if (document.visibilityState !== 'visible') return;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener('release', () => {
      console.log('Screen Wake Lock released:', wakeLock.released);
    });
    console.log('Screen Wake Lock released:', wakeLock.released);
  } catch (err) {
    console.error(`${err.name}, ${err.message}`);
  }
};

window.addEventListener("resize", function(event) {
  control.initCanvas();
  speedo.initCanvas();
});

window.addEventListener("orientationchange", function(event) {
  control.initCanvas();
  speedo.initCanvas();
});

window.onbeforeunload = function(event){ serial.connected = false;};

// Execute a function when the user releases a key on the keyboard
commandIn.addEventListener("keyup", function(event) {
  if (event.keyCode === 13) {
    event.preventDefault();
    if (serial.connected) sendCommand();
  }
});

speedocnv.addEventListener('click', function (event) {
  event.preventDefault();
  
  // Start demo on double click on speedometer canvas
  if (Date.now() - lastClick < 300) speedo.runDemo();
  lastClick = Date.now();

  serialdiv.style.visibility = "visible";
  setTimeout(function(){ 
    if (view == "speedo" && Date.now() - lastClick >= 3000) serialdiv.style.visibility = "hidden";}, 3000);
});

viewIn.addEventListener('click', function (event) {
  // Start demo of double click on speedometer canvas
  event.preventDefault();
  lastClick = Date.now();
});

function update(){
  // Send Commands
  if (serial.connected){
    if (control.protocol != "off") serial.sendBinary();
  }
  if (view == "log") log.updateLog();
  if (view == "chart") graph.updateGraph();
  if (speedo.demo) speedo.update();
}

function switchView(newView){
  if (view === "settings" && newView !== "settings") {
    // Leaving settings view
    serial.protocol = previousProtocol;
    recin.value = previousProtocol;
  } else if (newView === "settings") {
    // Entering settings view
    previousProtocol = serial.protocol;
    serial.protocol = "ascii";
    recin.value = "ascii";
  }

  view = newView;
  serialdiv.style.visibility = "visible";
  switch (view){
    case "log":
      bauddiv.style.display    = (serial.API == "serial")?"block":"none";
      APIdiv.style.display     = "block"; 
      commanddiv.style.display = "block";
      statsdiv.style.display   = (statsIn.checked) ? "block" : "none";
      watchindiv.style.display = "block";

      chartindiv.style.display = "none";
      ctrlindiv.style.display  = "none";
      statsindiv.style.display = "block";
      recdiv.style.display     = "block";
      senddiv.style.display    = "none";
      enginediv.style.display  = "none"; 

      chartdiv.style.display   = "none";
      controlcnv.style.display = "none";
      speedocnv.style.display  = "none";
      settingsdiv.style.display = "none";
      loggerdiv.style.display = "block";
      outputdiv.style.display = "block";
      pause_btn.style.visibility = "hidden";
      trash_btn.style.visibility = "hidden";
      break;
    case "chart":
      APIdiv.style.display     = "none";
      bauddiv.style.display    = "none";
      statsindiv.style.display = "none";
      watchindiv.style.display = "none";
      ctrlindiv.style.display  = "none";
      chartindiv.style.display = "block";
      recdiv.style.display     = "none";
      senddiv.style.display    = "none";
      enginediv.style.display  = "none";

      controlcnv.style.display = "none";
      speedocnv.style.display = "none";
      settingsdiv.style.display = "none";
      loggerdiv.style.display  = "none";
      statsdiv.style.display   = "none";
      commanddiv.style.display = "none";
      chartdiv.style.display = "block";
      outputdiv.style.display = "block";
      pause_btn.style.visibility = "visible";
      trash_btn.style.visibility = "visible";
      break;
    case "control":
      APIdiv.style.display     = "none";
      bauddiv.style.display    = "none";
      statsindiv.style.display = "none";
      watchindiv.style.display = "none";
      chartindiv.style.display = "none";  
      ctrlindiv.style.display  = "block";
      recdiv.style.display     = "none";
      senddiv.style.display = "block";
      outputdiv.style.display = "block";
      pause_btn.style.visibility = "hidden";
      trash_btn.style.visibility = "hidden";
      
      loggerdiv.style.display  = "none";
      chartdiv.style.display   = "none";
      statsdiv.style.display   = "none";
      commanddiv.style.display = "none";
      enginediv.style.display  = "none";
      speedocnv.style.display  = "none";
      settingsdiv.style.display = "none";
      controlcnv.style.display = "block";
      outputdiv.style.display = "block";

      control.initCanvas();
      break;
    case "speedo":
      APIdiv.style.display     = "none";
      bauddiv.style.display    = "none";
      pause_btn.style.visibility = "hidden";
      trash_btn.style.visibility = "hidden";
      
      statsindiv.style.display = "none";
      watchindiv.style.display = "none";
      chartindiv.style.display = "none";  
      ctrlindiv.style.display  = "none";
      recdiv.style.display     = "none";
      senddiv.style.display    = "none";
      enginediv.style.display  = "block";
      
      loggerdiv.style.display  = "none";
      chartdiv.style.display   = "none";
      statsdiv.style.display   = "none";
      commanddiv.style.display = "none";
      controlcnv.style.display = "none";
      settingsdiv.style.display = "none";
      speedocnv.style.display = "block";
      outputdiv.style.display = "block";
      speedo.initCanvas();
      speedocnv.click();
      break;
    case "settings":
      APIdiv.style.display     = "none";
      bauddiv.style.display    = "none";
      pause_btn.style.visibility = "hidden";
      trash_btn.style.visibility = "hidden";
      
      statsindiv.style.display = "none";
      watchindiv.style.display = "none";
      chartindiv.style.display = "none";  
      ctrlindiv.style.display  = "none";
      recdiv.style.display     = "none";
      senddiv.style.display    = "none";
      enginediv.style.display  = "none";
      
      loggerdiv.style.display  = "none";
      chartdiv.style.display   = "none";
      statsdiv.style.display   = "none";
      commanddiv.style.display = "none";
      controlcnv.style.display = "none";
      speedocnv.style.display  = "none";
      settingsdiv.style.display = "block";
      outputdiv.style.display  = "none";
      
      populateSettingsInputs();
      displayCurrentSettings();
      break;
  }
}

function toggleAPI(){
  serial.API = API.value;
  switchView(view);
}

function toggleMode(){
  serial.protocol = recin.value;
  control.protocol = sendin.value;
  control.mixer(); // Force value calculation
  switchView(view);
 }

function toggleStats(){
  switchView(view);
}

function toggleMixer(){
  control.mix = mixerIn.value;
  control.mixer(); // Force value calculation
}

function toggleEngine(){
  if (engine.value == "on"){
    start();
  }else{
    stop();
  }
}

function saveSettings() {
  const newSettings = {};
  for (let param in control.params) {
    const inputElement = document.getElementById(`setting${param}`);
    if (inputElement) {
      newSettings[param] = inputElement.value;
    }
  }

  control.updateSettings(newSettings);
  sendSetCommands(newSettings);
}

function sendSetCommands(settings) {
  if (serial.connected) {
    for (let param in settings) {
      const command = `$SET ${param} ${settings[param]}\r\n`;
      log.write(command, 3);
      serial.send(new TextEncoder().encode(command));
    }
    alert('Settings saved and sent to the hoverboard!');
  } else {
    alert('Settings saved locally. Connect to the hoverboard to apply changes.');
  }
}

function displayCurrentSettings() {
  // This function is now handled within parseGetResponse
}

function populateSettingsInputs() {
  sendGetCommand();
}

function sendGetCommand() {
  if (serial.connected) {
    console.info("Send $GET command");
    serial.send(new TextEncoder().encode("$GET\r\n"));
  } else {
    console.error("Serial not connected");
  }
}

function parseGetResponse(response) {
  console.log('Parsing GET response:', response);
  if (!response) {
    console.error('Response is empty or null');
    return;
  }
  const lines = response.split('\n');
  const settingsContent = document.getElementById('settingsContent');
  const currentSettingsDiv = document.getElementById('currentSettings');
  
  if (!settingsContent || !currentSettingsDiv) {
    console.error('Required DOM elements not found');
    return;
  }

  settingsContent.innerHTML = '';
  currentSettingsDiv.innerHTML = '<h4>Current Settings:</h4>';

  lines.forEach((line, index) => {
    console.log(`Processing line ${index}:`, line);
    if (line.startsWith('# name:')) {
      const match = line.match(/"([^"]+)"\s+value:(-?\d+)\s+init:-?\d+\s+min:(-?\d+)\s+max:(\d+)/);
      if (match) {
        const [, name, value, min, max] = match;
        
        if (name in control.params) {
          settingsContent.innerHTML += `
            <div class="row">
              <div class="six columns">
                <label for="setting${name}">${name}</label>
                <input class="u-full-width" type="number" id="setting${name}" 
                       min="${min}" max="${max}" 
                       value="${value}">
              </div>
              <div class="six columns">
                <p class="help-text">${control.params[name].help}</p>
              </div>
            </div>
          `;
        } else {
          currentSettingsDiv.innerHTML += `<p>${name}: <span id="current${name}">${value}</span></p>`;
        }
      } else {
        console.error(`Failed to parse line: ${line}`);
      }
    }
  });
}

function update(){
  // Send Commands
  if (serial.connected){
    if (control.protocol != "off") serial.sendBinary();
  }
  if (view == "log") log.updateLog();
  if (view == "chart") graph.updateGraph();
  if (speedo.demo) speedo.update();
}

function toggleSubplot(){
  graph.subplot(subplotIn.value == "yes");
}

function deleteData(){
  if (view == "log"){
    log.clear();
  }else{
    graph.clear();
  }
}

function pauseUpdate(){
  if (log.isPaused){
    graph.autoScroll = log.autoScroll = true;
    pause_btn.innerHTML = '<ion-icon name="pause"></ion-icon>';
    pause1_btn.innerHTML = '<ion-icon name="pause"></ion-icon>';
  }else{
    graph.autoScroll = log.autoScroll = false;
    pause_btn.innerHTML = '<ion-icon name="play"></ion-icon>';
    pause1_btn.innerHTML = '<ion-icon name="play"></ion-icon>';
  }
  graph.isPaused = log.isPaused = !log.isPaused;
}

function sendCommand() {
  let command = commandIn.value + (crIn.checked ?"\r":"") + (lfIn.checked ?"\n":"");
  let encoder = new TextEncoder();
  serial.send(encoder.encode(command));
}

//Below RTC, TODO: maybe put to extra file

var rtc_receiver = null;

function setRtcReceiverRunning() {
  rtc_server_btn.innerHTML ='STOP WEB RTC Receiver';
}

function setRtcReceiverPeerConnected() {
  rtc_server_btn.style.backgroundColor = "green";
  

  if (serial) { serial.rtc_peer_connected = true };
}

function setRTCReceiverStopped() {
  rtc_server_btn.innerHTML = 'Start Web RTP Receiver';
  
  if (serial) { serial.rtc_peer_connected = false };
}

function startRtcReceiver() {
  console.log('Starting receiver');

  rtc_receiver = new Peer('5254f3ac-1f73-47a4-ae25-c4d0499a0f8e', {
    debug:0
  });

  rtc_receiver.on('open', function (id) {
    console.log('My peer ID is: ' + id);
    setRtcReceiverRunning();
  });


  rtc_receiver.on('connection', function (conn) {
    console.log('Connected');
    setRtcReceiverPeerConnected();

    // Receive messages
    conn.on('data', function(data) {
      
      const dataview = new Int8Array(data);
      console.log('Reeived', dataview);
      if (serial.connected) {
        serial.send(dataview);
      }
    });

    conn.on('error', function(err) {
      console.log(err);
      setRTCReceiverStopped();
      alert('' + err);
    });
  });

  rtc_receiver.on('disconnected', function () {
    //status.innerHTML = "Connection lost. Please reconnect";
    console.log('Connection lost. Please reconnect');

    // Workaround for peer.reconnect deleting previous id
    // peer.id = lastPeerId;
    // peer._lastServerId = lastPeerId;
    //peer.reconnect();

    rtc_server_btn.innerText('Start Web RTP Receiver')
  });

  rtc_receiver.on('close', function() {
      // conn = null;
      // status.innerHTML = "Connection destroyed. Please refresh";
    console.log('Connection destroyed');
    setRTCReceiverStopped();
  });

  rtc_receiver.on('error', function (err) {
    console.log(err);
    setRTCReceiverStopped();
    alert('' + err);
  });
  
}
