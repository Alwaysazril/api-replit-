module.exports = {
  PORT: process.env.PORT || 3556,
  WS_PORT: process.env.WS_PORT || 3556,

  // WhatsApp bug types (bug_id HARUS sama persis dengan switch case di routes/whatsapp.js)
  BUGS: [
    { bug_id: "AhhCrot",      bug_name: "Blank Hard"   },
    { bug_id: "bleng",        bug_name: "Blank Click"  },
    { bug_id: "blankmsg",          bug_name: "Blank Msg" },
    { bug_id: "crashbeta",   bug_name: "Beta Wangcap"    },
    { bug_id: "MarkNyawit",   bug_name: "Stuck Logo"   },
    { bug_id: "IosCrash",     bug_name: "Crash Ios"    },
    { bug_id: "crashfcnewxryy",  bug_name: "Forclose Bugs"     },
  ],

  payload: [
    { bug_id: "bleng",            bug_name: "Blank"        },
    { bug_id: "epcinjir",         bug_name: "Fc Call"      },
    { bug_id: "BuritMambu",           bug_name: "Hard Delay"  },
    { bug_id: "ZenoCrashNoClick", bug_name: "FC Click"     },
  ],

  DDOS: [
    { ddos_id: "s-gbps", ddos_name: "SYN High GBPS"    },
    { ddos_id: "s-pps",  ddos_name: "SYN Traffic Flood" },
    { ddos_id: "a-gbps", ddos_name: "ACK High GBPS"    },
    { ddos_id: "a-pps",  ddos_name: "ACK Traffic Flood" },
    { ddos_id: "icmp",   ddos_name: "ICMP Flood"        },
    { ddos_id: "udp",    ddos_name: "GUDP ( HIGH RISK )" }
  ],

  NEWS: [
    {
      image: "https://g.top4top.io/p_3789tpwwq3.png",
      title: "AZRIL STRAVAS V1.0",
      desc: "Selamat datang di Azril Stravas Official App. Tools terlengkap & terpercaya!"
    },
    {
      image: "https://l.top4top.io/p_3789tpwwq3.png",
      title: "UPDATE TERBARU",
      desc: "Fitur baru: Buy Account, Chat Owner real-time, Profile page & Dragon Red theme!"
    },
    {
      image: "https://g.top4top.io/p_3789tpwwq3.png",
      title: "HUBUNGI ADMIN",
      desc: "Pertanyaan soal akun? Chat owner langsung dari menu profil atau @usserunknownn"
    }
  ],

  ROLE_COOLDOWNS: {
    member:    300,
    reseller:  240,
    reseller1:  60,
    owner:       0,
    vip:        60,
  },

  MAX_QUANTITIES: {
    member:    5,
    reseller:  5,
    reseller1: 5,
    owner:    10,
    vip:      10,
  }
};
