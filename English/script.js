// Firebase cấu hình và xử lý lưu/đọc dữ liệu cho từ vựng

let chartInstance = null;
let monthChartInstances = [];

// ✅ Hàm thông báo status
function showStatus(message, isError = false) {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = isError ? 'error' : 'success';
    setTimeout(() => status.textContent = '', 3000);
}

// ✅ Ghi dữ liệu từ form vào Realtime Database
function addEntry() {
    const date = document.getElementById('dateInput').value;
    const wordCount = document.getElementById('wordCount').value;
    if (!date || !wordCount) {
        showStatus("Vui lòng chọn ngày và nhập số từ vựng!", true);
        return;
    }

    const entry = `${date},${wordCount}\n`;
    document.getElementById('dataInput').value += entry;

    const db = firebase.database().ref("vocabEntries");
    // Xóa các bản ghi có cùng ngày
    db.orderByChild("date").equalTo(date).once("value")
        .then(snapshot => {
            const updates = [];
            snapshot.forEach(child => {
                updates.push(child.ref.remove());
            });
            return Promise.all(updates);
        })
        .then(() => {
            return db.push({ date, wordCount: parseInt(wordCount) });
        })
        .then(() => {
            showStatus("Đã lưu vào Firebase!");
            document.getElementById('dateInput').value = '';
            document.getElementById('wordCount').value = '';
            fetchFirebaseData();
        })
        .catch((error) => {
            console.error("Lỗi ghi dữ liệu:", error);
            showStatus("Lỗi khi lưu Firebase!", true);
        });
}

// ✅ Đọc dữ liệu từ Firebase và hiển thị vào textarea
function fetchFirebaseData() {
    firebase.database().ref("vocabEntries").once("value")
        .then(snapshot => {
            let data = '';
            snapshot.forEach(child => {
                const { date, wordCount } = child.val();
                data += `${date},${wordCount}\n`;
            });
            document.getElementById('dataInput').value = data;
            showStatus("Đã tải dữ liệu từ Firebase!");
            refreshData();
        })
        .catch(err => {
            console.error("Lỗi đọc dữ liệu Firebase:", err);
            showStatus("Lỗi khi đọc Firebase!", true);
        });
}

// ✅ Ghi toàn bộ dữ liệu từ textarea vào Firebase (batch)
function saveAllToFirebase() {
    const rawData = document.getElementById('dataInput').value;
    const lines = rawData.split('\n').filter(line => line.trim());
    let successCount = 0;
    let failCount = 0;

    const db = firebase.database().ref("vocabEntries");
    const existing = {};

    // Tải dữ liệu cũ để xử lý cập nhật
    db.once("value").then(snapshot => {
        snapshot.forEach(child => {
            const { date } = child.val();
            if (!existing[date]) existing[date] = [];
            existing[date].push(child.key);
        });

        const updates = lines.map(line => {
            const [date, wordCountStr] = line.split(',');
            const wordCount = parseInt(wordCountStr);
            if (date && !isNaN(wordCount)) {
                const deletes = (existing[date] || []).map(key => db.child(key).remove());
                return Promise.all(deletes).then(() => db.push({ date, wordCount })).then(() => successCount++);
            } else {
                failCount++;
                return Promise.resolve();
            }
        });

        return Promise.all(updates);
    }).then(() => {
        showStatus(`Đã lưu ${successCount} dòng vào Firebase. ${failCount} dòng lỗi.`, failCount > 0);
        fetchFirebaseData();
    });
}

// ✅ Làm mới thống kê
function refreshData() {
    const data = document.getElementById('dataInput').value;
    if (!data.trim()) {
        showStatus("Chưa có dữ liệu để làm mới!", true);
        return;
    }
    showStatus("Đã làm mới dữ liệu!");
    updateStats();
    updateMonthSelect();
    updateYearSelect();
    updateChart();
    updateYearChart();
}

// ✅ Gọi hàm khi load trang để hiển thị dữ liệu Firebase
window.addEventListener("load", () => {
    fetchFirebaseData();
});
        function updateStats() {
            const data = document.getElementById('dataInput').value;
            const lines = data.split('\n').filter(line => line.trim());
            const dailyStats = {};
            const monthlyStats = {};
            let totalWords = 0;

            lines.forEach(line => {
                const [date, count] = line.split(',');
                if (date && count && !isNaN(count)) {
                    const wordCount = parseInt(count);
                    totalWords += wordCount;
                    dailyStats[date] = (dailyStats[date] || 0) + wordCount;
                    const month = date.slice(0, 7);
                    monthlyStats[month] = (monthlyStats[month] || 0) + wordCount;
                }
            });

            const statsTable1 = document.getElementById('statsTable1');
            const statsTable2 = document.getElementById('statsTable2');
            statsTable1.innerHTML = '';
            statsTable2.innerHTML = '';

            // Tính tổng tích lũy từ ngày cũ nhất đến mới nhất
            const sortedDaysAsc = Object.entries(dailyStats).sort();
            const cumulativeTotals = {};
            let cumulativeTotal = 0;
            sortedDaysAsc.forEach(([date, count]) => {
                cumulativeTotal += count;
                cumulativeTotals[date] = cumulativeTotal;
            });

            // Hiển thị bảng với ngày mới nhất ở trên
            const sortedDaysDesc = sortedDaysAsc.reverse();
            statsTable1.innerHTML += `
                <tr class="total-row">
                    <td>Tổng</td>
                    <td></td>
                    <td>${totalWords}</td>
                </tr>
            `;
            sortedDaysDesc.forEach(([date, count]) => {
                statsTable1.innerHTML += `
                    <tr>
                        <td>${date}</td>
                        <td>${count}</td>
                        <td>${cumulativeTotals[date]}</td>
                    </tr>
                `;
            });

            statsTable2.innerHTML += `
                <tr class="total-row">
                    <td>Tổng</td>
                    <td>${totalWords}</td>
                </tr>
            `;
            Object.entries(monthlyStats).sort().reverse().forEach(([month, count]) => {
                statsTable2.innerHTML += `
                    <tr>
                        <td>${month}</td>
                        <td>${count}</td>
                    </tr>
                `;
            });
        }

        function updateMonthSelect() {
            const data = document.getElementById('dataInput').value;
            const lines = data.split('\n').filter(line => line.trim());
            const months = new Set();
            lines.forEach(line => {
                const [date] = line.split(',');
                if (date) months.add(date.slice(0, 7));
            });

            const monthSelect = document.getElementById('monthSelect');
            monthSelect.innerHTML = '';
            const sortedMonths = Array.from(months).sort();
            sortedMonths.forEach(month => {
                const option = document.createElement('option');
                option.value = month;
                option.textContent = month;
                monthSelect.appendChild(option);
            });
            if (sortedMonths.length > 0) {
                monthSelect.value = sortedMonths[sortedMonths.length - 1]; // Chọn tháng mới nhất
                updateChart();
            }
        }

        function updateYearSelect() {
            const data = document.getElementById('dataInput').value;
            const lines = data.split('\n').filter(line => line.trim());
            const years = new Set();
            lines.forEach(line => {
                const [date] = line.split(',');
                if (date) years.add(date.slice(0, 4));
            });

            const yearSelect = document.getElementById('yearSelect');
            yearSelect.innerHTML = '';
            const sortedYears = Array.from(years).sort();
            sortedYears.forEach(year => {
                const option = document.createElement('option');
                option.value = year;
                option.textContent = year;
                yearSelect.appendChild(option);
            });
            if (sortedYears.length > 0) {
                yearSelect.value = sortedYears[sortedYears.length - 1]; // Chọn năm mới nhất
                updateYearChart();
            }
        }

        function getDaysInMonth(year, month) {
            return new Date(year, month, 0).getDate();
        }

function updateChart() {
    const data = document.getElementById('dataInput').value;
    const selectedMonth = document.getElementById('monthSelect').value;
    if (!selectedMonth) return;

    const lines = data.split('\n').filter(line => line.trim());
    const dailyStats = {};
    lines.forEach(line => {
        const [date, count] = line.split(',');
        if (date && count && !isNaN(count) && date.startsWith(selectedMonth)) {
            dailyStats[date] = parseInt(count); // Sửa từ dailyEvalStats thành dailyStats
        }
    });

    const [year, month] = selectedMonth.split('-').map(Number);
    const daysInMonth = getDaysInMonth(year, month);
    const labels = Array.from({ length: daysInMonth }, (_, i) => {
        const day = String(i + 1).padStart(2, '0');
        return `${selectedMonth}-${day}`;
    });
    const dataPoints = labels.map(date => dailyStats[date] || 0.1);

    const ctx = document.getElementById('wordChart').getContext('2d');
    if (chartInstance) chartInstance.destroy();

    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels.map(date => date.slice(8, 10)),
            datasets: [{
                label: 'Số từ vựng',
                data: dataPoints,
                backgroundColor: '#40c4ff',
                borderColor: '#0288d1',
                borderWidth: 1
            }]
        },
        options: {
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { color: '#e0e0e0' },
                    grid: { color: '#333' }
                },
                x: {
                    ticks: { color: '#e0e0e0' },
                    grid: { display: false }
                }
            },
            plugins: {
                legend: { labels: { color: '#e0e0e0' } }
            }
        }
    });
}

        function updateYearChart() {
            const data = document.getElementById('dataInput').value;
            const selectedYear = document.getElementById('yearSelect').value;
            if (!selectedYear) return;

            const lines = data.split('\n').filter(line => line.trim());
            const dailyStats = {};
            let maxValue = 0;
            lines.forEach(line => {
                const [date, count] = line.split(',');
                if (date && count && !isNaN(count) && date.startsWith(selectedYear)) {
                    const wordCount = parseInt(count);
                    dailyStats[date] = wordCount;
                    maxValue = Math.max(maxValue, wordCount);
                }
            });

            const monthCharts = document.getElementById('monthCharts');
            monthCharts.innerHTML = '';
            monthChartInstances.forEach(chart => chart.destroy());
            monthChartInstances = [];

            for (let month = 1; month <= 12; month++) {
                const monthStr = String(month).padStart(2, '0');
                const daysInMonth = getDaysInMonth(selectedYear, month);
                const labels = Array.from({ length: daysInMonth }, (_, i) => String(i + 1).padStart(2, '0'));
                const dataPoints = labels.map(day => {
                    const date = `${selectedYear}-${monthStr}-${day}`;
                    return dailyStats[date] || 0;
                });

                const chartContainer = document.createElement('div');
                chartContainer.className = 'month-chart';
                const chartTitle = document.createElement('h4');
                chartTitle.textContent = `Tháng ${monthStr}`;
                const canvas = document.createElement('canvas');
                canvas.id = `monthChart${month}`;
                chartContainer.appendChild(chartTitle);
                chartContainer.appendChild(canvas);
                monthCharts.appendChild(chartContainer);

                const ctx = canvas.getContext('2d');
                const chart = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: 'Số từ vựng',
                            data: dataPoints,
                            borderColor: '#ffca28',
                            backgroundColor: 'rgba(255, 202, 40, 0.2)',
                            fill: true,
                            tension: 0.4,
                            pointBackgroundColor: '#ffca28',
                            pointBorderColor: '#ffb300',
                            pointRadius: 2
                        }]
                    },
                    options: {
                        scales: {
                            y: {
                                beginAtZero: true,
                                max: maxValue || 10,
                                ticks: { color: '#e0e0e0', font: { size: 10 } },
                                grid: { color: '#333' }
                            },
                            x: {
                                ticks: { color: '#e0e0e0', font: { size: 10 }, maxTicksLimit: 10 },
                                grid: { display: false }
                            }
                        },
                        plugins: {
                            legend: { display: false }
                        }
                    }
                });
                monthChartInstances.push(chart);
            }
        }