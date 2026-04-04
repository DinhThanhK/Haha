window.WAITING_GIFS = [
  // Duyệt binh
  "https://media1.tenor.com/m/ofyem1Uk49YAAAAC/vietnam-march-victory-day.gif",
  // Cờ đỏ sao vàng
  "https://media1.tenor.com/m/HlpS6ZPkW0cAAAAd/h%E1%BB%99i-lhpnt%E1%BB%89nh-c%C3%A0mau.gif",
  // Cờ Đảng + cờ đỏ
  "https://media1.tenor.com/m/uR3_f6vNZw0AAAAC/h%E1%BB%99i-lhpnt%E1%BB%89nh-c%C3%A0mau.gif",
  // Bác Hồ + cờ
  "https://media1.tenor.com/m/lJIT2uBWWSkAAAAd/vietnam-ho-chi-minh.gif",
];
 

window.getRandomWaitingGif = function() {
  const list = window.WAITING_GIFS;
  return list[Math.floor(Math.random() * list.length)];
};
 