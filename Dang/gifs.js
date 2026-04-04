window.WAITING_GIFS = [
  // Quốc kỳ Việt Nam bay
  "https://media.tenor.com/Fp2rY2gLbpEAAAAC/vietnam-ho-chi-minh.gif",
  // Cờ đỏ sao vàng
  "https://media.tenor.com/iHLlNI1XNRQAAAAC/h%E1%BB%99i-lhpnt%E1%BB%89nh-c%C3%A0mau.gif",
  // Cờ Đảng + cờ đỏ
  "https://media.tenor.com/9bQ3j9bS1ZEAAAAC/vietnam-flag.gif",
  // Bác Hồ + cờ
  "https://media.tenor.com/Jqj2RzB8v_sAAAAC/vietnam.gif",
  // Lễ kết nạp Đảng
  "https://media.tenor.com/QrUqDNfGv2MAAAAC/party-flag.gif",
];
 
/**
 * Trả về một GIF URL ngẫu nhiên từ danh sách
 */
window.getRandomWaitingGif = function() {
  const list = window.WAITING_GIFS;
  return list[Math.floor(Math.random() * list.length)];
};
 