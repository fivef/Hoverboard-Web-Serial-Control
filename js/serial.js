class Serial {
  constructor(size) {
    this.API = 'serial';
    this.connected = false;
    this.rtc_peer_connected = false;
    this.protocol = "ascii";
    this.lastStatsUpdate = Date.now();
    this.statsUpdateFrequency = 500;

    this.rtc_conn = null;

    // Buffer
    this.bufferSize = size;
    this.writeBuffer = new ArrayBuffer(this.bufferSize);
    this.writedv = new DataView(this.writeBuffer);
    this.writeOffset = 0;
    this.readOffset = 0;

    // Web bluetooth
    this.bluetoothName = 'BT05';
    this.bluetoothService = 0xffe0;
    this.bluetoothCharacteristic = 0xffe1;
    this.bleSending = false;
    this.lastConnectedDevice = null;

    // Transmition Statistics
    this.error = 0;
    this.skip = 0;
    this.success = 0;

    // UART binary
    this.serial_start_frame = 0xABCD;

    // Length of outgoing UART binary messages
    this.serial_length = 8;

    // UART incoming binary messages
    this.binary = new Struct(
      {
        frame: "uint16",
        cmd1: "int16",
        cmd2: "int16",
        speedR: "int16",
        speedL: "int16",
        batV: "int16",
        temp: "int16",
        cmdLed: "uint16",
        checksum: "uint16"
      }, 0, true);
    this.binarycur = new Struct(
      {
        frame: "uint16",
        cmd1: "int16",
        cmd2: "int16",
        speedR: "int16",
        speedL: "int16",
        batV: "int16",
        temp: "int16",
        dccurr: "int16",
        cmdLed: "uint16",
        checksum: "uint16"
      }, 0, true);
    this.usartFeedback = this.binarycur;
    //this.readBuffer = new ArrayBuffer(this.usartFeedback.byteLength);
    //this.readdv = new DataView(this.readBuffer);

    // UART outgoing binary messages
    this.usartCommand = new Struct(
      {
        frame: ["uint16", this.serial_start_frame],
        steer: "int16",
        speed: "int16",
        checksum: "uint16",
      }, 0, true);

    // UART sideboard outgoing binary messages
    this.sideboardCommand = new Struct(
      {
        frame: ["uint16", this.serial_start_frame],
        pitch: ["int16", 0],
        dpitch: ["int16", 0],
        steer: "int16",
        speed: "int16",
        switches: "uint16",
        checksum: "uint16",
      }, 0, true);

    // IBUS
    this.ibus_channels = 14;
    this.ibus_length = this.ibus_channels * 2 + 4;
  }

  setConnected() {
    connect_btn.innerHTML = '<ion-icon name="flash-off"></ion-icon>';
    API.disabled = baudrate.disabled = this.connected = true;
    send_btn.disabled = !this.connected;
  }

  setDisconnected() {
    connect_btn.innerHTML = '<ion-icon name="flash"></ion-icon>';
    API.disabled = this.connected = false;
    baudrate.disabled = (this.API == "bluetooth");
    send_btn.disabled = !this.connected;
  }

  async connect() {
    if (this.connected) {
      // disconnect
      if (this.API == 'bluetooth') {
        this.device.gatt.disconnect();
      } else {
        this.reader.cancel();
      }

      // Update UI
      this.setDisconnected();
      return;
    }

    if (this.API == 'serial') {
      this.connectSerial();
    } else if (this.API == 'rtc') {
      this.connectRTC();
    } else if (this.API == 'bluetooth'){
      const reconnected = await this.tryReconnectLastDevice();
      if (!reconnected) {
        this.connectBluetooth();
      }
    } else {
      console.log("Error when connecting. Unknown API type: ");
      console.log(this.API);
    }
  }

  async connectSerial() {
    if ("serial" in navigator) {
      try {
        this.port = await navigator.serial.requestPort();
        // Open and begin reading.
        await this.port.open({
          baudRate: parseInt(baudrate.value)
        });

        // Update UI
        this.setConnected();

        while (this.port.readable) {
          this.inputStream = this.port.readable;
          this.reader = this.inputStream.getReader();

          try {
            while (true) {
              const { value, done } = await this.reader.read();
              if (done) {
                log.write("Reader canceled", 2);
                break;
              }

              this.bufferWrite(value);
              this.readLoop();
              if (!this.connected) break;
            }
          } catch (error) {
            // Handle non-fatal read error.
            console.log(error, 2);
          } finally {
            this.reader.releaseLock();
          }
          if (!this.connected) break;
        }
      } catch (error) {
        console.error("Error in connectSerial:", error);
        log.write("Failed to connect: " + error.message, 2);
      } finally {
        if (this.port) {
          await this.port.close();
        }
        this.setDisconnected();
      }
    } else {
      log.write("Web Serial API not supported in this browser", 2);
    }
  }

  async connectBluetooth() {
    try {
      let device;
      if (this.lastConnectedDevice && this.lastConnectedDevice.gatt.connected) {
        device = this.lastConnectedDevice;
      } else {
        let options = {
          acceptAllDevices: true,
          optionalServices: [this.bluetoothService],
        };
        device = await navigator.bluetooth.requestDevice(options);
      }

      this.device = device;
      device.addEventListener('gattserverdisconnected', this.onDisconnected);
      const server = await device.gatt.connect();
      this.server = server;
      const service = await server.getPrimaryService(this.bluetoothService);
      this.service = service;
      const characteristic = await service.getCharacteristic(this.bluetoothCharacteristic);
      await characteristic.startNotifications();
      this.characteristic = characteristic;
      
      // Update UI
      this.setConnected();
      this.characteristic.addEventListener('characteristicvaluechanged', this.handleCharacteristicValueChanged);
      
      // Store the last connected device
      this.lastConnectedDevice = device;
      localStorage.setItem('lastConnectedDeviceId', device.id);
    } catch (error) {
      console.log(error);
    }
  }

  async tryReconnectLastDevice() {
    const lastDeviceId = localStorage.getItem('lastConnectedDeviceId');
    if (lastDeviceId) {
      try {
        const devices = await navigator.bluetooth.getDevices();
        const lastDevice = devices.find(device => device.id === lastDeviceId);
        if (lastDevice) {
          this.lastConnectedDevice = lastDevice;
          await this.connectBluetooth();
          return true;
        }
      } catch (error) {
        console.log('Failed to reconnect to last device:', error);
      }
    }
    return false;
  }

  connectRTC() {
    if (this.rtc_conn != null && this.rtc_conn != undefined) {
      console.log("Already connected, send test message.")
      this.rtc_conn.send('Hello im a client!');
      return;
    }

    console.log('Connect to RTC Server');

    var peer = new Peer(null, {
      debug: 0
    });

    console.log('created conn');

    peer.on('open', (id) => {
      console.log('Peer with id opened', id);

      this.rtc_conn = peer.connect('5254f3ac-1f73-47a4-ae25-c4d0499a0f8e', {
        reliable: false //faster for games, should be right here
      });

      this.rtc_conn.on('open', () => {
        console.log('Connected');
        // Update UI
        this.setConnected();
        // Disallow incoming connections
        // c.on('open', function() {
        //     c.send("Sender does not accept incoming connections");
        //     setTimeout(function() { c.close(); }, 500);
        // });
      });

      // Receive messages
      this.rtc_conn.on('data', function (data) {
        console.log('Received', data);
      });

      this.rtc_conn.on('error', function (err) {
        console.log(err);
        alert('' + err);
      });
    });
      
    peer.on('disconnected', function () {
      console.log('Connection lost. Please reconnect');
      // Update UI
      this.setDisconnected();
    });
    peer.on('close', function () {
      console.log('Connection destroyed');
      // Update UI
      this.setDisconnected();
    });

    peer.on('error', function (err) {
      console.log(err);
      alert('' + err);
      // Update UI
      this.setDisconnected();
    });
  }

  handleCharacteristicValueChanged(event) {
    let chunk = new Uint8Array(event.target.value.buffer);
    serial.bufferWrite(chunk);
    serial.readLoop();
  }

  onDisconnected(event) {
    // Update UI
    serial.setDisconnected();
  }

  bufferWrite(chunk) {
    // add new chunk to the buffer
    for (let i = 0, strLen = chunk.length; i < strLen; i++) {
      this.writedv.setUint8(this.address(this.writeOffset), chunk[i], true);
      this.setWriteOffset(this.writeOffset + 1);
    }
  }

  readLoop() {
    console.log("Current protocol:", this.protocol); // Debug output
    if (this.protocol.startsWith("binary")) {
      // read as long as there is enough data in the buffer
      while ((this.writeOffset) >= (this.readOffset + this.usartFeedback.byteLength)) {
        this.readBinary();
      }
    } else {
      // Read buffer until \n
      while ((this.writeOffset) >= (this.readOffset)) {
        if (this.writedv.getUint8(this.address(this.readOffset), true) != 0x0A) {
          this.skipByte();
        } else {
          let found = this.readAscii();
          if (!found) break;
        }
      }
    }
    this.displayStats();
  }

  address(offset) {
    return offset % this.bufferSize;
  }

  setReadOffset(offset) {
    this.readOffset = offset;
  }

  setWriteOffset(offset) {
    this.writeOffset = offset;
  }

  skipByte() {
    this.setReadOffset(this.readOffset + 1); // incorrect start frame, increase read offset
    this.skip++;
  }

  displayStats() {
    if ((Date.now() - this.lastStatsUpdate < this.statsUpdateFrequency) || statsdiv.style.display == 'none') return;
    this.lastStatsUpdate = Date.now();

    read.value = this.address(this.readOffset);
    write.value = this.address(this.writeOffset);
    success.value = this.success;
    skip.value = this.skip;
    error.value = this.error;
  }

  readBinary() {
    this.usartFeedback = this[this.protocol];
    var readBuffer = new ArrayBuffer(this.usartFeedback.byteLength);
    var readdv = new DataView(readBuffer);

    // copy chunk to new arrayBuffer
    for (let i = 0, strLen = this.usartFeedback.byteLength; i < strLen; i++) {
      let val = this.writedv.getUint8(this.address(this.readOffset + i), true);
      readdv.setUint8(i, val, true);
    }

    // Read struct
    let message = this.usartFeedback.read(readdv);
    if (message.frame != this.serial_start_frame) {
      this.skipByte();
      return;
    }
    // Checksum is XOR of all fields except checksum cast to Uint
    let calcChecksum = new Uint16Array([
      Object.keys(message)
        .filter(key => key != "checksum")
        .map(key => message[key])
        .reduce((acc, curr) => (acc ^ curr))
    ])[0];



    // validate checksum
    if (message.checksum == calcChecksum) {
      this.update(message);
    } else {
      this.error++;
      log.write(Object.keys(message).map(key => (key + ":" + message[key])).join(" "), 2);
    }

    this.setReadOffset(this.readOffset + this.usartFeedback.byteLength); // increase read offset by message size
  }

  readAscii() {
    let string = '';
    let i = 1;
    let found = false;
    // read until next \n
    while (this.writeOffset >= this.readOffset + i) {
      let char = this.writedv.getUint8(this.address(this.readOffset + i), true);
      if (char == 0x0A) {
        // Save new read pointer
        this.setReadOffset(this.readOffset + i);
        found = true;
        break;
      } else {
        string += String.fromCharCode(char);
        i++;
      }
    }

    log.write(string, 3);

    // \n not found, buffer probably doesn't have enough data, exit
    if (!found) {
      return false;
    }

    if (string.trim() === 'OK') {
      if (this.getResponse) {
        parseGetResponse(this.getResponse);
        this.getResponse = '';
      }
      return true;
    }

    // Parse $GET response
    if (string.startsWith('# name:')) {
      if (!this.getResponse) {
        this.getResponse = '';
      }
      this.getResponse += string + '\n';
      return true;
    }

    let words = string.split(" ");
    let message = {};
    let err = false;

    // It's an error, show in red
    if (string[0] == "!") {
      log.write(string, 2);
      return true;
    } else {
      // If first word doesn't contain semi-colon, no need to parse it
      if (/^.*[:]-?\d+$/.test(words[0]) == false) {
        log.write(string, 3);
        return true;
      }
    }

    for (let j = 0; j < words.length; j++) {
      let [index, value] = words[j].split(':');

      // Skip rows having empty values
      if (value === undefined) {
        continue;
      }
      message[index] = value;
    }

    if (!err && Object.entries(message).length > 0) {
      this.update(message);
    } else {
      this.error++;
      log.write(string, 2);
    }

    return true;
  }

  update(message) {
    console.log('Updating with message:', message);
    this.success++;
    graph.updateData(message);
    telemetry.update(message);
    if (watchIn.checked) log.writeLog(message);
  }

  sendBinary() {
    let bytes = 0;
    switch (control.protocol) {
      case "usart":
        bytes = new Uint8Array(
          this.usartCommand.write(
            {
              steer: control.channel[0],
              speed: control.channel[1],
              checksum: this.serial_start_frame ^ control.channel[0] ^ control.channel[1],
            }));
        break;
      case "hovercar":
        bytes = new Uint8Array(
          this.sideboardCommand.write(
            {
              steer: control.channel[0],
              speed: control.channel[1],
              switches: control.switches,
              checksum: this.serial_start_frame ^ control.channel[0] ^ control.channel[1] ^ control.switches,
            }));
        break;
      case "ibus":
        var ab = new ArrayBuffer(this.ibus_length);
        var dv = new DataView(ab);

        // Write Ibus Start Frame
        dv.setUint8(0, this.ibus_length);
        dv.setUint8(1, this.ibus_command);
        // Write channel values
        for (let i = 0; i < this.ibus_channels * 2; i += 2) {
          dv.setUint16(i + 2, control.channel[i / 2], true);
        }

        // Calculate checksum
        let checksum = 0xFFFF;
        for (let i = 0; i < this.ibus_length - 2; i++) {
          checksum -= dv.getUint8(i);
        }
        dv.setUint16(this.ibus_length - 2, checksum, true);

        bytes = new Uint8Array(ab);
        break;
    }

    //Don't send if data is received via web rtc
    if (rtc_receiver) {
      if (this.rtc_peer_connected) return;
    }
    this.send(bytes);

  };

  async send(bytes) {
    if (this.API == 'serial') {
      // Web Serial
      this.outputStream = this.port.writable;
      this.writer = this.outputStream.getWriter();
      this.writer.write(bytes);
      this.writer.releaseLock();
    } else if (this.API == 'rtc') {
      this.rtc_conn.send(bytes);
    } else if (this.API == 'bluetooth') {
      if (this.bleSending) return;
      // Web Bluetooth
      let chunksize = 20;
      let sent = 0;
      while (sent < bytes.length) {
        // Sent chunks of chunksize bytes because of BLE limitation
        this.bleSending = true;
        // await this.characteristic.writeValueWithoutResponse(bytes.slice(sent,sent+chunksize));
        await this.characteristic.writeValue(bytes.slice(sent, sent + chunksize));
        this.bleSending = false;
        sent += chunksize;
      }
    } else {
      console.log("Error when sending. Unknown API type: ");
      console.log(this.API);
    }
  }
}
