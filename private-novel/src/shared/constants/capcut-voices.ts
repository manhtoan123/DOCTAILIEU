// Voice/resource metadata: jutlyne/capcut-tts (MIT), commit 150e49bee79462f83f527498535cd39ad5c74dcb.
// Existing IDs remain stable for saved preferences and listening cursors.
export const capcutVietnameseVoices:readonly {id:string;serverId:string;name:string;resource:string}[]=[
  {
    "serverId": "BV074_streaming",
    "name": "Cô Gái Hoạt Ngôn",
    "resource": "7102355709945188865",
    "id": "tiktok-female-1"
  },
  {
    "serverId": "BV075_streaming",
    "name": "Thanh Niên Tự Tin",
    "resource": "7102355803792740865",
    "id": "tiktok-male-1"
  },
  {
    "serverId": "BV421_vivn_streaming",
    "name": "Nhỏ Ngọt Ngào",
    "resource": "7252594014782755330",
    "id": "capcut-BV421_vivn_streaming"
  },
  {
    "serverId": "vi_female_huong",
    "name": "Giọng Nữ Phổ Thông",
    "resource": "7264854897953083905",
    "id": "capcut-vi_female_huong"
  },
  {
    "serverId": "BV074_streaming_dsp",
    "name": "Giọng Bé",
    "resource": "7550087831092251920",
    "id": "capcut-BV074_streaming_dsp"
  },
  {
    "serverId": "BV075_streaming_vibrato_dsp",
    "name": "Việt Méo",
    "resource": "7569450639810465040",
    "id": "capcut-BV075_streaming_vibrato_dsp"
  },
  {
    "serverId": "BV562_streaming",
    "name": "Mai",
    "resource": "7483736254694035984",
    "id": "capcut-BV562_streaming"
  },
  {
    "serverId": "BV075_streaming_demon_dsp",
    "name": "Kenny Đại Đế",
    "resource": "7569442422665661712",
    "id": "capcut-BV075_streaming_demon_dsp"
  },
  {
    "serverId": "BV075_streaming_robot_dsp",
    "name": "Robot VN",
    "resource": "7538698409633516816",
    "id": "capcut-BV075_streaming_robot_dsp"
  },
  {
    "serverId": "BV560_streaming",
    "name": "Alex Đại Đế",
    "resource": "7483736167565758992",
    "id": "capcut-BV560_streaming"
  }
];
export const ttsVoiceIds=capcutVietnameseVoices.map(voice=>voice.id);
