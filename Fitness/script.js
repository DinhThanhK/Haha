// Firebase cấu hình và xử lý lưu/đọc dữ liệu cho fitness tracker

let chartInstance = null;
let monthChartInstances = [];
 
let fitnessData = [];

// ✅ Hàm thông báo status
function showStatus(message, isError = false) {
    const status = document.getElementById('status');
    if (status) {
        status.textContent = message;
        status.className = isError ? 'error' : 'success';
        setTimeout(() => status.textContent = '', 3000);
    } else {
        console.log(message);
    }
}

// Hàm tạo nhãn cho biểu đồ theo năm
function generateLabels(year) {
    return Array.from({ length: 365 }, (_, index) => {
        const date = new Date(year, 0, 1);
        date.setDate(date.getDate() + index);
        return date.toISOString().split('T')[0];
    });
}

// Khởi tạo biểu đồ
const charts = {
    'Gập bụng - lưng': new Chart(document.getElementById('absBackChart').getContext('2d'), {
        type: 'bar',
        data: {
            labels: generateLabels(2025),
            datasets: [
                { label: 'Buổi Sáng', data: Array(365).fill(0), backgroundColor: '#FFD700', stack: 'Stack 0', order: 1 },
                { label: 'Buổi Chiều', data: Array(365).fill(0), backgroundColor: 'blue', stack: 'Stack 0', order: 2 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: { display: true, text: 'Ngày', color: '#e0e0e0', font: { size: 16 } },
                    ticks: {
                        callback: function(value, index) {
                            const year = parseInt(document.getElementById('year').value);
                            const date = new Date(year, 0, 1);
                            date.setDate(date.getDate() + index);
                            return date.getMonth() + 1 ;
                        },
                        maxTicksLimit: 12,
                        color: '#e0e0e0',
                        font: { size: 16 }
                    },
                    grid: { color: '#444' }
                },
                y: {
                    title: { display: true, text: 'Số Lần', color: '#e0e0e0', font: { size: 16 } },
                    beginAtZero: true,
                    stacked: true,
                    ticks: { color: '#e0e0e0', font: { size: 16 } },
                    grid: { color: '#444' },
                }
            },
            plugins: { legend: { labels: { color: '#e0e0e0', font: { size: 16 } } } }
        }
    }),
    'Gập bụng - chân': new Chart(document.getElementById('absLegChart').getContext('2d'), {
        type: 'bar',
        data: {
            labels: generateLabels(2025),
            datasets: [
                { label: 'Buổi Sáng', data: Array(365).fill(0), backgroundColor: '#FFD700', stack: 'Stack 0', order: 1 },
                { label: 'Buổi Chiều', data: Array(365).fill(0), backgroundColor: 'blue', stack: 'Stack 0', order: 2 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: { display: true, text: 'Ngày', color: '#e0e0e0', font: { size: 16 } },
                    ticks: {
                        callback: function(value, index) {
                            const year = parseInt(document.getElementById('year').value);
                            const date = new Date(year, 0, 1);
                            date.setDate(date.getDate() + index);
                            return date.getMonth() + 1 ;
                        },
                        maxTicksLimit: 12,
                        color: '#e0e0e0', font: { size: 16 }
                    },
                    grid: { color: '#444' }
                },
                y: {
                    title: { display: true, text: 'Số Lần', color: '#e0e0e0', font: { size: 16 } },
                    beginAtZero: true,
                    stacked: true,
                    ticks: { color: '#e0e0e0', font: { size: 16 }, font: { size: 16 } },
                    grid: { color: '#444' }
                }
            },
            plugins: { legend: { labels: { color: '#e0e0e0', font: { size: 16 } } } }
        }
    }),
    'Tập tay': new Chart(document.getElementById('armsChart').getContext('2d'), {
        type: 'bar',
        data: {
            labels: generateLabels(2025),
            datasets: [
                { label: 'Buổi Sáng', data: Array(365).fill(0), backgroundColor: '#FFD700', stack: 'Stack 0', order: 1 },
                { label: 'Buổi Chiều', data: Array(365).fill(0), backgroundColor: 'blue', stack: 'Stack 0', order: 2 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: { display: true, text: 'Ngày', color: '#e0e0e0', font: { size: 16 } },
                    ticks: {
                        callback: function(value, index) {
                            const year = parseInt(document.getElementById('year').value);
                            const date = new Date(year, 0, 1);
                            date.setDate(date.getDate() + index);
                            return date.getMonth() + 1 ;
                        },
                        maxTicksLimit: 12,
                        color: '#e0e0e0', font: { size: 16 }
                    },
                    grid: { color: '#444' }
                },
                y: {
                    title: { display: true, text: 'Số Lần', color: '#e0e0e0', font: { size: 16 } },
                    beginAtZero: true,
                    stacked: true,
                    ticks: { color: '#e0e0e0', font: { size: 16 } },
                    grid: { color: '#444' }
                }
            },
            plugins: { legend: { labels: { color: '#e0e0e0', font: { size: 16 } } } }
        }
    }),
    'Hít đất': new Chart(document.getElementById('pushUpChart').getContext('2d'), {
        type: 'bar',
        data: {
            labels: generateLabels(2025),
            datasets: [
                { label: 'Buổi Sáng', data: Array(365).fill(0), backgroundColor: '#FFD700', stack: 'Stack 0', order: 1 },
                { label: 'Buổi Chiều', data: Array(365).fill(0), backgroundColor: 'blue', stack: 'Stack 0', order: 2 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: { display: true, text: 'Ngày', color: '#e0e0e0', font: { size: 16 } },
                    ticks: {
                        callback: function(value, index) {
                            const year = parseInt(document.getElementById('year').value);
                            const date = new Date(year, 0, 1);
                            date.setDate(date.getDate() + index);
                            return date.getMonth() + 1 ;
                        },
                        maxTicksLimit: 12,
                        color: '#e0e0e0', font: { size: 16 }
                    },
                    grid: { color: '#444' }
                },
                y: {
                    title: { display: true, text: 'Số Lần', color: '#e0e0e0' , font: { size: 16 } },
                    beginAtZero: true,
                    stacked: true,
                    ticks: { color: '#e0e0e0', font: { size: 16 } },
                    grid: { color: '#444' }
                }
            },
            plugins: { legend: { labels: { color: '#e0e0e0' , font: { size: 16 } } } }
        }
    }),
    'Plank': new Chart(document.getElementById('plankChart').getContext('2d'), {
        type: 'bar',
        data: {
            labels: generateLabels(2025),
            datasets: [
                { label: 'Buổi Sáng', data: Array(365).fill(0), backgroundColor: '#FFD700', stack: 'Stack 0', order: 1 },
                { label: 'Buổi Chiều', data: Array(365).fill(0), backgroundColor: 'blue', stack: 'Stack 0', order: 2 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: { display: true, text: 'Ngày', color: '#e0e0e0', font: { size: 16 } },
                    ticks: {
                        callback: function(value, index) {
                            const year = parseInt(document.getElementById('year').value);
                            const date = new Date(year, 0, 1);
                            date.setDate(date.getDate() + index);
                            return date.getMonth() + 1 ;
                        },
                        maxTicksLimit: 12,
                        color: '#e0e0e0', font: { size: 16 }
                    },
                    grid: { color: '#444' }
                },
                y: {
                    title: { display: true, text: 'Giây', color: '#e0e0e0', font: { size: 16 } },
                    beginAtZero: true,
                    stacked: true,
                    ticks: { color: '#e0e0e0', font: { size: 16 } },
                    grid: { color: '#444' }
                }
            },
            plugins: { legend: { labels: { color: '#e0e0e0', font: { size: 16 } } } }
        }
    }),
    'Tập chân': new Chart(document.getElementById('legChart').getContext('2d'), {
        type: 'bar',
        data: {
            labels: generateLabels(2025),
            datasets: [
                { label: 'Buổi Sáng', data: Array(365).fill(0), backgroundColor: '#FFD700', stack: 'Stack 0', order: 1 },
                { label: 'Buổi Chiều', data: Array(365).fill(0), backgroundColor: 'blue', stack: 'Stack 0', order: 2 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: { display: true, text: 'Ngày', color: '#e0e0e0' , font: { size: 16 } },
                    ticks: {
                        callback: function(value, index) {
                            const year = parseInt(document.getElementById('year').value);
                            const date = new Date(year, 0, 1);
                            date.setDate(date.getDate() + index);
                            return date.getMonth() + 1 ;
                        },
                        maxTicksLimit: 12,
                        color: '#e0e0e0', font: { size: 16 }
                    },
                    grid: { color: '#444' }
                },
                y: {
                    title: { display: true, text: 'Số Lần', color: '#e0e0e0', font: { size: 16 } },
                    beginAtZero: true,
                    stacked: true,
                    ticks: { color: '#e0e0e0', font: { size: 16 } },
                    grid: { color: '#444' }
                }
            },
            plugins: { legend: { labels: { color: '#e0e0e0', font: { size: 16 } } } }
        }
    }),
    'Nhảy tại chỗ': new Chart(document.getElementById('jumpChart').getContext('2d'), {
        type: 'bar',
        data: {
            labels: generateLabels(2025),
            datasets: [
                { label: 'Buổi Sáng', data: Array(365).fill(0), backgroundColor: '#FFD700', stack: 'Stack 0', order: 1 },
                { label: 'Buổi Chiều', data: Array(365).fill(0), backgroundColor: 'blue', stack: 'Stack 0', order: 2 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: { display: true, text: 'Ngày', color: '#e0e0e0', font: { size: 16 } },
                    ticks: {
                        callback: function(value, index) {
                            const year = parseInt(document.getElementById('year').value);
                            const date = new Date(year, 0, 1);
                            date.setDate(date.getDate() + index);
                            return date.getMonth() + 1 ;
                        },
                        maxTicksLimit: 12,
                        color: '#e0e0e0', font: { size: 16 }
                    },
                    grid: { color: '#444' }
                },
                y: {
                    title: { display: true, text: 'Số Lần', color: '#e0e0e0', font: { size: 16 } },
                    beginAtZero: true,
                    stacked: true,
                    ticks: { color: '#e0e0e0', font: { size: 16 } },
                    grid: { color: '#444' }
                }
            },
            plugins: { legend: { labels: { color: '#e0e0e0', font: { size: 16 } } } }
        }
    })
};

// ✅ Stopwatch cho bài tập (đặc biệt Plank)
let stopwatchInterval = null;
let stopwatchTime = 0; // Giây
let isRunning = false;

function updateStopwatchDisplay() {
    const minutes = Math.floor(stopwatchTime / 60);
    const seconds = stopwatchTime % 60;
    document.getElementById('stopwatch-display').textContent = 
        `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function updateStopwatchFromInput(session) {
    const input = document.getElementById(session);
    const value = parseFloat(input.value) || 0;
    stopwatchTime = Math.round(value);
    updateStopwatchDisplay();
}

function startStopwatch() {
    if (!document.getElementById('type').value) {
        showStatus('Vui lòng chọn loại tập trước!', true);
        return;
    }
    if (isRunning) {
        // Dừng và điền dữ liệu vào input tương ứng
        clearInterval(stopwatchInterval);
        isRunning = false;
        const startStopBtn = document.getElementById('startStopBtn');
        startStopBtn.textContent = 'Start';
        startStopBtn.classList.remove('running');
        
        const session = document.getElementById('sessionSelect').value;
        document.getElementById(session).value = stopwatchTime;
        showStatus(`Đã dừng! Thời gian: ${stopwatchTime} giây (buổi ${session === 'morning' ? 'Sáng' : 'Chiều'}).`);
    } else {
        // Bắt đầu
        stopwatchInterval = setInterval(() => {
            stopwatchTime++;
            updateStopwatchDisplay();
        }, 1000);
        isRunning = true;
        const startStopBtn = document.getElementById('startStopBtn');
        startStopBtn.textContent = 'Stop';
        startStopBtn.classList.add('running');
        showStatus('Đang bấm giờ...');
    }
}

function resetStopwatch() {
    clearInterval(stopwatchInterval);
    stopwatchTime = 0;
    isRunning = false;
    updateStopwatchDisplay();
    const startStopBtn = document.getElementById('startStopBtn');
    startStopBtn.textContent = 'Start';
    startStopBtn.classList.remove('running');
    showStatus('Đã reset thời gian.');
}

// Event listeners cho stopwatch
document.addEventListener('DOMContentLoaded', () => {
    const typeSelect = document.getElementById('type');
    const stopwatchGroup = document.getElementById('stopwatch-group');
    const stopwatchControls = document.getElementById('stopwatch-controls');
    const startStopBtn = document.getElementById('startStopBtn');
    const resetBtn = document.getElementById('resetBtn');
    const sessionSelect = document.getElementById('sessionSelect');
    const morningInput = document.getElementById('morning');
    const afternoonInput = document.getElementById('afternoon');

    // Set default date to today ngay khi DOM ready
    const dateInput = document.getElementById('date');
    if (dateInput && !dateInput.value) {
        dateInput.value = new Date().toISOString().split('T')[0];
    }

    // Hiện/ẩn stopwatch khi chọn loại
    typeSelect.addEventListener('change', () => {
        const isPlank = typeSelect.value === 'Plank';
        if (isPlank) {
            stopwatchGroup.style.display = 'flex';
            stopwatchControls.style.display = 'flex';
            // Thay đổi label và step cho Plank (đơn vị giây, số nguyên)
            document.getElementById('morningLabel').textContent = 'Buổi Sáng (giây):';
            document.getElementById('afternoonLabel').textContent = 'Buổi Chiều (giây):';
            morningInput.step = '1';
            afternoonInput.step = '1';
            // Set session mặc định dựa vào thời gian thực
            const currentHour = new Date().getHours();
            sessionSelect.value = currentHour < 12 ? 'morning' : 'afternoon';
            // Update stopwatch từ input mặc định
            updateStopwatchFromInput(sessionSelect.value);
            // Reset stopwatch (nhưng giữ time từ input)
        } else {
            stopwatchGroup.style.display = 'none';
            stopwatchControls.style.display = 'none';
            // Khôi phục label và step cho các loại khác (số lần, thập phân)
            document.getElementById('morningLabel').textContent = 'Buổi Sáng:';
            document.getElementById('afternoonLabel').textContent = 'Buổi Chiều:';
            morningInput.step = '0.1';
            afternoonInput.step = '0.1';
            // Clear stopwatch nếu đang chạy
            if (isRunning) {
                clearInterval(stopwatchInterval);
                isRunning = false;
                startStopBtn.textContent = 'Start';
                startStopBtn.classList.remove('running');
            }
        }
        // Trigger load data for current date and type
        loadDataForDate();
    });

    // Event cho sessionSelect change: Update stopwatch từ input tương ứng
    sessionSelect.addEventListener('change', () => {
        if (typeSelect.value === 'Plank') {
            updateStopwatchFromInput(sessionSelect.value);
        }
    });

    startStopBtn.addEventListener('click', startStopwatch);
    resetBtn.addEventListener('click', resetStopwatch);

    // Vấn đề 4: Khi click/focus vào input morning/afternoon (chỉ cho Plank), set stopwatchTime từ value
    [morningInput, afternoonInput].forEach(input => {
        input.addEventListener('focus', () => {
            if (typeSelect.value === 'Plank') {
                const value = parseFloat(input.value) || 0;
                stopwatchTime = Math.round(value); // Round để số nguyên giây
                updateStopwatchDisplay();
            }
        });
    });
});

// ✅ Load dữ liệu cho ngày và loại hiện tại khi chọn date hoặc type
function loadDataForDate() {
    const date = document.getElementById('date').value;
    const type = document.getElementById('type').value;
    if (!date || !type) return;

    const db = firebase.database().ref("fitnessEntries");
    db.orderByChild("date").equalTo(date).once("value")
        .then(snapshot => {
            let morning = 0;
            let afternoon = 0;
            snapshot.forEach(child => {
                if (child.val().type === type) {
                    morning = child.val().morning || 0;
                    afternoon = child.val().afternoon || 0;
                }
            });
            document.getElementById('morning').value = morning;
            document.getElementById('afternoon').value = afternoon;
            // Nếu Plank, update stopwatch display từ input dựa trên session hiện tại
            if (type === 'Plank') {
                const sessionSelect = document.getElementById('sessionSelect');
                const currentSession = sessionSelect ? sessionSelect.value : 'afternoon';
                updateStopwatchFromInput(currentSession);
            }
            showStatus(`Đã load dữ liệu cho ${date} - ${type}`);
        })
        .catch(err => {
            console.error("Lỗi load dữ liệu:", err);
            showStatus("Lỗi khi load dữ liệu!", true);
        });
}

// Event cho date change
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('date').addEventListener('change', loadDataForDate);
});

// ✅ Ghi dữ liệu từ form vào Realtime Database
function addData() {
    const date = document.getElementById('date').value;
    const morning = parseFloat(document.getElementById('morning').value) || 0;
    const afternoon = parseFloat(document.getElementById('afternoon').value) || 0;
    const type = document.getElementById('type').value;

    if (!date || !type) {
        showStatus('Vui lòng chọn ngày và loại tập!', true);
        return;
    }

    // Đối với Plank, round thành số nguyên giây
    let morningToSave = morning;
    let afternoonToSave = afternoon;
    if (type === 'Plank') {
        morningToSave = Math.round(morning);
        afternoonToSave = Math.round(afternoon);
    }

    const db = firebase.database().ref("fitnessEntries");
    // Xóa các bản ghi có cùng date và type
    db.orderByChild("date").equalTo(date).once("value")
        .then(snapshot => {
            const updates = [];
            snapshot.forEach(child => {
                if (child.val().type === type) {
                    updates.push(child.ref.remove());
                }
            });
            return Promise.all(updates);
        })
        .then(() => {
            return db.push({ date, morning: morningToSave, afternoon: afternoonToSave, type });
        })
        .then(() => {
            showStatus("Đã lưu vào Firebase!");
            document.getElementById('date').value = '';
            document.getElementById('morning').value = '';
            document.getElementById('afternoon').value = '';
            if (document.getElementById('type').value === 'Plank') {
                resetStopwatch();
            }
            fetchFirebaseData();
            // Refresh trang như F5 sau khi lưu thành công
            setTimeout(() => {
                location.reload();
            }, 1000); // Delay 1s để hiển thị status trước khi refresh
        })
        .catch((error) => {
            console.error("Lỗi ghi dữ liệu:", error);
            showStatus("Lỗi khi lưu Firebase!", true);
        });
}

// ✅ Đọc dữ liệu từ Firebase và hiển thị vào textarea
function fetchFirebaseData() {
    firebase.database().ref("fitnessEntries").once("value")
        .then(snapshot => {
            let dataText = '';
            fitnessData = [];
            snapshot.forEach(child => {
                const { date, morning, afternoon, type } = child.val();
                fitnessData.push({ date, morning, afternoon, type });
                dataText += `${date},${morning},${afternoon},${type}\n`;
            });
            document.getElementById('dataText').value = dataText;
            showStatus("Đã tải dữ liệu từ Firebase!");
            updateCharts();
        })
        .catch(err => {
            console.error("Lỗi đọc dữ liệu Firebase:", err);
            showStatus("Lỗi khi đọc Firebase!", true);
        });
}

// ✅ Ghi toàn bộ dữ liệu từ textarea vào Firebase (batch)
function saveAllToFirebase() {
    const rawData = document.getElementById('dataText').value;
    const lines = rawData.split('\n').filter(line => line.trim());
    let successCount = 0;
    let failCount = 0;

    const db = firebase.database().ref("fitnessEntries");
    const existing = {};

    // Tải dữ liệu cũ để xử lý cập nhật
    db.once("value").then(snapshot => {
        snapshot.forEach(child => {
            const { date, type } = child.val();
            const key = `${date}_${type}`;
            if (!existing[key]) existing[key] = [];
            existing[key].push(child.key);
        });

        const updates = lines.map(line => {
            const [date, morningStr, afternoonStr, type] = line.split(',');
            const morning = parseFloat(morningStr);
            const afternoon = parseFloat(afternoonStr);
            if (date && type && !isNaN(morning) && !isNaN(afternoon)) {
                const key = `${date}_${type}`;
                const deletes = (existing[key] || []).map(id => db.child(id).remove());
                return Promise.all(deletes).then(() => db.push({ date, morning, afternoon, type })).then(() => successCount++);
            } else {
                failCount++;
                return Promise.resolve();
            }
        });

        return Promise.all(updates);
    }).then(() => {
        showStatus(`Đã lưu ${successCount} dòng vào Firebase. ${failCount} dòng lỗi.`, failCount > 0);
        fetchFirebaseData();
    }).catch(err => {
        console.error("Lỗi lưu dữ liệu:", err);
        showStatus("Lỗi khi lưu Firebase!", true);
    });
}

// Cập nhật biểu đồ
function updateCharts() {
    const types = ['Gập bụng - lưng', 'Gập bụng - chân', 'Tập tay', 'Hít đất', 'Plank', 'Tập chân', 'Nhảy tại chỗ'];
    const year = parseInt(document.getElementById('year').value || new Date().getFullYear());
    const startDate = new Date(year, 0, 1);

    // Cập nhật nhãn cho tất cả biểu đồ
    types.forEach(type => {
        charts[type].data.labels = generateLabels(year);
    });

    types.forEach(type => {
        const morningData = Array(365).fill(0);
        const afternoonData = Array(365).fill(0);
        fitnessData.forEach(item => {
            if (item.type === type) {
                const itemDate = new Date(item.date);
                const dayIndex = Math.floor((itemDate - startDate) / (1000 * 60 * 60 * 24));
                if (dayIndex >= 0 && dayIndex < 365) {
                    morningData[dayIndex] = item.morning;
                    afternoonData[dayIndex] = item.afternoon;
                }
            }
        });
        charts[type].data.datasets[0].data = morningData;
        charts[type].data.datasets[1].data = afternoonData;
        charts[type].update();
    });
}

// Gọi hàm khi load trang để hiển thị dữ liệu Firebase
window.addEventListener("load", () => {
    fetchFirebaseData();
    updateStopwatchDisplay(); // Khởi tạo hiển thị stopwatch
});