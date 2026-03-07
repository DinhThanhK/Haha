// ==========================================
// BIẾN TOÀN CỤC
// ==========================================
let data = [];
let headers = [];
let decisionTree = null;
let targetColumn = null;
let ignoreColumns = [];
let calculationSteps = [];

// ==========================================
// RESET & INITIALIZATION
// ==========================================
function resetAllData() {
    data = [];
    headers = [];
    decisionTree = null;
    targetColumn = null;
    ignoreColumns = [];
    calculationSteps = [];
    
    document.getElementById('dataPreview').style.display = 'none';
    document.getElementById('columnSelection').style.display = 'none';
    document.getElementById('stats').style.display = 'none';
    document.getElementById('trainBtn').disabled = true;
    document.getElementById('showTreeBtn').disabled = true;
    document.getElementById('showCalculationsBtn').style.display = 'none';
    document.getElementById('treeVisualization').style.display = 'none';
    document.getElementById('calculationsDisplay').style.display = 'none';
    document.getElementById('predictionForm').innerHTML = '<p class="empty-state">Vui lòng tải dữ liệu và training model trước</p>';
    document.getElementById('predictionResult').style.display = 'none';
    document.getElementById('status').style.display = 'none';
}

// ==========================================
// FILE HANDLING
// ==========================================
document.getElementById('csvFile').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    resetAllData();
    document.getElementById('fileName').textContent = `Đã chọn: ${file.name}`;

    const reader = new FileReader();
    const fileName = file.name.toLowerCase();
    
    if (fileName.endsWith('.csv')) {
        reader.onload = function(event) {
            parseCSV(event.target.result);
        };
        reader.readAsText(file);
    } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        reader.onload = function(event) {
            const data = new Uint8Array(event.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const csv = XLSX.utils.sheet_to_csv(worksheet);
            parseCSV(csv);
        };
        reader.readAsArrayBuffer(file);
    } else {
        showStatus('error', '❌ Vui lòng chọn file CSV hoặc Excel (.xlsx, .xls)');
    }
});

function parseCSV(csv) {
    const lines = csv.trim().split('\n');
    headers = lines[0].split(',').map(h => h.trim());
    data = [];

    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        const row = {};
        headers.forEach((header, index) => {
            row[header] = values[index];
        });
        data.push(row);
    }

    showStatus('success', `✅ Đã tải ${data.length} dòng dữ liệu với ${headers.length} cột`);
    showDataPreview();
    showColumnSelection();
}

function showDataPreview() {
    const preview = document.getElementById('dataPreview');
    preview.style.display = 'block';
    
    let html = '<table><thead><tr>';
    headers.forEach(h => html += `<th>${h}</th>`);
    html += '</tr></thead><tbody>';
    
    data.slice(0, 100).forEach(row => {
        html += '<tr>';
        headers.forEach(h => html += `<td>${row[h] || '-'}</td>`);
        html += '</tr>';
    });
    html += '</tbody></table>';
    
    preview.innerHTML = html;
}

function showColumnSelection() {
    document.getElementById('columnSelection').style.display = 'block';
    
    // Target column dropdown
    const targetSelect = document.getElementById('targetColumnSelect');
    targetSelect.innerHTML = '<option value="">-- Chọn cột target --</option>';
    headers.forEach((header, idx) => {
        const option = document.createElement('option');
        option.value = header;
        option.textContent = header;
        if (idx === headers.length - 1) option.selected = true;
        targetSelect.appendChild(option);
    });
    
    // Ignore columns checkboxes
    const ignoreCheckbox = document.getElementById('ignoreColumnsCheckbox');
    ignoreCheckbox.innerHTML = '';
    
    headers.forEach(header => {
        const div = document.createElement('div');
        div.className = 'checkbox-item';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `ignore_${header}`;
        checkbox.value = header;
        
        const label = document.createElement('label');
        label.htmlFor = `ignore_${header}`;
        label.textContent = header;
        
        div.appendChild(checkbox);
        div.appendChild(label);
        ignoreCheckbox.appendChild(div);
    });
    
    document.getElementById('trainBtn').disabled = false;
}

function showStatus(type, message) {
    const status = document.getElementById('status');
    status.className = `status ${type}`;
    status.textContent = message;
    status.style.display = 'block';
}

// ==========================================
// TRAINING
// ==========================================
document.getElementById('trainBtn').addEventListener('click', function() {
    if (data.length === 0) {
        showStatus('error', '❌ Chưa có dữ liệu để training!');
        return;
    }

    targetColumn = document.getElementById('targetColumnSelect').value;
    if (!targetColumn) {
        showStatus('error', '❌ Vui lòng chọn cột target!');
        return;
    }

    ignoreColumns = Array.from(
        document.querySelectorAll('#ignoreColumnsCheckbox input[type="checkbox"]:checked')
    ).map(cb => cb.value);

    if (ignoreColumns.includes(targetColumn)) {
        showStatus('error', '❌ Không thể bỏ qua cột target!');
        return;
    }

    const features = headers.filter(h => h !== targetColumn && !ignoreColumns.includes(h));

    if (features.length === 0) {
        showStatus('error', '❌ Không có feature nào để training!');
        return;
    }

    showStatus('info', `⏳ Đang training model với thuật toán ID3...`);

    setTimeout(() => {
        calculationSteps = [];
        decisionTree = buildDecisionTree(data, features, targetColumn);
        
        showStatus('success', `✅ Training thành công! Sử dụng ${features.length} features, bỏ qua ${ignoreColumns.length} cột`);
        showStats(features);
        createPredictionForm(features);
        
        document.getElementById('showTreeBtn').disabled = false;
        document.getElementById('showCalculationsBtn').disabled = false;
        document.getElementById('showCalculationsBtn').style.display = 'inline-block';
    }, 500);
});

function showStats(features) {
    const uniqueClasses = [...new Set(data.map(row => row[targetColumn]))];
    const treeDepth = getTreeDepth(decisionTree);
    const leafCount = countLeaves(decisionTree);

    const statsHtml = `
        <div class="stat-card">
            <div class="number">${data.length}</div>
            <div class="label">Samples</div>
        </div>
        <div class="stat-card">
            <div class="number">${features.length}</div>
            <div class="label">Features</div>
        </div>
        <div class="stat-card">
            <div class="number">${uniqueClasses.length}</div>
            <div class="label">Classes</div>
        </div>
        <div class="stat-card">
            <div class="number">${treeDepth}</div>
            <div class="label">Tree Depth</div>
        </div>
        <div class="stat-card">
            <div class="number">${leafCount}</div>
            <div class="label">Leaf Nodes</div>
        </div>
    `;

    document.getElementById('stats').innerHTML = statsHtml;
    document.getElementById('stats').style.display = 'grid';
}

function getTreeDepth(node) {
    if (!node || node.isLeaf) return 1;
    let maxDepth = 0;
    for (let child of Object.values(node.children)) {
        maxDepth = Math.max(maxDepth, getTreeDepth(child));
    }
    return maxDepth + 1;
}

function countLeaves(node) {
    if (!node || node.isLeaf) return 1;
    let count = 0;
    for (let child of Object.values(node.children)) {
        count += countLeaves(child);
    }
    return count;
}

// ==========================================
// THUẬT TOÁN ID3 (QUINLAN)
// ==========================================
function buildDecisionTree(dataset, features, target) {
    const classes = dataset.map(row => row[target]);
    const uniqueClasses = [...new Set(classes)];
    
    // Nếu tất cả samples có cùng class
    if (uniqueClasses.length === 1) {
        return { 
            isLeaf: true, 
            value: uniqueClasses[0],
            samples: dataset.length
        };
    }

    // Nếu không còn features
    if (features.length === 0) {
        return { 
            isLeaf: true, 
            value: getMajorityClass(dataset, target),
            samples: dataset.length
        };
    }

    // Chọn feature tốt nhất dựa trên Information Gain
    const bestFeature = getBestFeatureByID3(dataset, features, target);
    
    const tree = {
        feature: bestFeature,
        children: {},
        majorityClass: getMajorityClass(dataset, target),
        isLeaf: false,
        samples: dataset.length
    };

    // Tạo các nhánh con
    const featureValues = [...new Set(dataset.map(row => row[bestFeature]))];

    featureValues.forEach(value => {
        const subset = dataset.filter(row => row[bestFeature] === value);
        const remainingFeatures = features.filter(f => f !== bestFeature);
        
        if (subset.length === 0) {
            tree.children[value] = { 
                isLeaf: true, 
                value: tree.majorityClass,
                samples: 0
            };
        } else {
            tree.children[value] = buildDecisionTree(subset, remainingFeatures, target);
        }
    });

    return tree;
}

function getBestFeatureByID3(dataset, features, target) {
    const datasetEntropy = calculateEntropy(dataset, target);
    
    calculationSteps.push({
        type: 'dataset_entropy',
        entropy: datasetEntropy,
        samples: dataset.length
    });
    
    console.log(`\n📊 TÍNH TOÁN ID3 - Information Gain`);
    console.log(`${'='.repeat(50)}`);
    console.log(`🌳 Entropy(Dataset) = ${datasetEntropy.toFixed(4)}`);
    console.log(`   Dataset có ${dataset.length} mẫu\n`);
    
    let bestFeature = features[0];
    let maxGain = -Infinity;
    let featureGains = [];

    features.forEach(feature => {
        const gain = calculateInformationGain(dataset, feature, target, datasetEntropy);
        featureGains.push({ feature, gain: gain.informationGain, details: gain });
        
        console.log(`📌 Feature: ${feature}`);
        console.log(`   Information Gain = ${gain.informationGain.toFixed(4)}`);
        
        if (gain.informationGain > maxGain) {
            maxGain = gain.informationGain;
            bestFeature = feature;
        }
    });

    calculationSteps.push({
        type: 'feature_comparison',
        features: featureGains,
        bestFeature: bestFeature,
        maxGain: maxGain
    });

    console.log(`\n✅ Chọn feature: ${bestFeature} (Gain = ${maxGain.toFixed(4)})`);
    console.log(`${'='.repeat(50)}\n`);
    
    return bestFeature;
}

function calculateEntropy(dataset, target) {
    const total = dataset.length;
    if (total === 0) return 0;
    
    const classCounts = {};
    dataset.forEach(row => {
        const cls = row[target];
        classCounts[cls] = (classCounts[cls] || 0) + 1;
    });
    
    let entropy = 0;
    for (let cls in classCounts) {
        const probability = classCounts[cls] / total;
        if (probability > 0) {
            entropy -= probability * Math.log2(probability);
        }
    }
    
    return entropy;
}

function calculateInformationGain(dataset, feature, target, datasetEntropy) {
    const total = dataset.length;
    const featureValues = [...new Set(dataset.map(row => row[feature]))];
    
    let weightedEntropy = 0;
    const subsets = {};
    
    console.log(`   Các giá trị của ${feature}:`);
    
    featureValues.forEach(value => {
        const subset = dataset.filter(row => row[feature] === value);
        const subsetEntropy = calculateEntropy(subset, target);
        const weight = subset.length / total;
        
        subsets[value] = {
            size: subset.length,
            entropy: subsetEntropy,
            weight: weight
        };
        
        weightedEntropy += weight * subsetEntropy;
        
        const classCounts = {};
        subset.forEach(row => {
            const cls = row[target];
            classCounts[cls] = (classCounts[cls] || 0) + 1;
        });
        
        console.log(`      ${value}: ${subset.length} mẫu ${JSON.stringify(classCounts)} → Entropy = ${subsetEntropy.toFixed(4)}`);
    });
    
    const informationGain = datasetEntropy - weightedEntropy;
    
    console.log(`   Weighted Entropy = ${weightedEntropy.toFixed(4)}`);
    console.log(`   → Gain = ${datasetEntropy.toFixed(4)} - ${weightedEntropy.toFixed(4)} = ${informationGain.toFixed(4)}\n`);
    
    return {
        informationGain: informationGain,
        datasetEntropy: datasetEntropy,
        weightedEntropy: weightedEntropy,
        subsets: subsets
    };
}

function getMajorityClass(dataset, target) {
    const classCounts = {};
    dataset.forEach(row => {
        const cls = row[target];
        classCounts[cls] = (classCounts[cls] || 0) + 1;
    });
    
    let maxCount = 0;
    let majorityClass = null;
    
    for (let cls in classCounts) {
        if (classCounts[cls] > maxCount) {
            maxCount = classCounts[cls];
            majorityClass = cls;
        }
    }
    
    return majorityClass;
}

// ==========================================
// PREDICTION
// ==========================================
function createPredictionForm(features) {
    let formHtml = '<div id="dynamicPredictionInputs">';
    
    features.forEach(feature => {
        const uniqueValues = [...new Set(data.map(row => row[feature]))];
        
        formHtml += `
            <div class="input-group" id="group_${feature}">
                <label>
                    ${feature}:
                    <span class="badge required">Bắt buộc</span>
                </label>
                <select id="input_${feature}" onchange="onPredictionInputChange()">
                    <option value="">-- Chọn ${feature} --</option>
                    ${uniqueValues.map(val => `<option value="${val}">${val}</option>`).join('')}
                </select>
            </div>
        `;
    });

    formHtml += '</div>';
    formHtml += '<button class="btn btn-secondary" onclick="resetPredictionForm()" style="background: #6c757d;">🔄 Reset</button>';
    
    document.getElementById('predictionForm').innerHTML = formHtml;
}

function onPredictionInputChange() {
    const features = headers.filter(h => h !== targetColumn && !ignoreColumns.includes(h));
    const input = {};
    
    features.forEach(feature => {
        const value = document.getElementById(`input_${feature}`).value;
        if (value) input[feature] = value;
    });
    
    const predictResult = tryPredict(decisionTree, input, features);
    updatePredictionFormUI(predictResult, features);
}

function tryPredict(node, input, allFeatures) {
    const result = {
        canPredict: false,
        prediction: null,
        requiredFields: [],
        optionalFields: [...allFeatures]
    };
    
    function traverse(currentNode, currentInput, path = []) {
        if (currentNode.isLeaf) {
            result.canPredict = true;
            result.prediction = currentNode.value;
            result.requiredFields = path;
            result.optionalFields = allFeatures.filter(f => !path.includes(f));
            return true;
        }
        
        const featureValue = currentInput[currentNode.feature];
        
        if (!featureValue) {
            result.requiredFields = [...path, currentNode.feature];
            result.optionalFields = allFeatures.filter(f => !result.requiredFields.includes(f));
            return false;
        }
        
        const child = currentNode.children[featureValue];
        
        if (!child) {
            result.canPredict = true;
            result.prediction = currentNode.majorityClass;
            result.requiredFields = path;
            result.optionalFields = allFeatures.filter(f => !path.includes(f));
            return true;
        }
        
        return traverse(child, currentInput, [...path, currentNode.feature]);
    }
    
    traverse(node, input);
    return result;
}

function updatePredictionFormUI(predictResult, allFeatures) {
    allFeatures.forEach(feature => {
        const group = document.getElementById(`group_${feature}`);
        const input = document.getElementById(`input_${feature}`);
        const label = group.querySelector('label');
        
        const oldBadge = label.querySelector('.badge');
        if (oldBadge) oldBadge.remove();
        
        const hasValue = input.value !== '';
        const isRequired = predictResult.requiredFields.includes(feature);
        
        if (hasValue) {
            const badge = document.createElement('span');
            badge.className = 'badge auto';
            badge.textContent = '✓ Đã chọn';
            label.appendChild(badge);
            group.classList.remove('optional', 'disabled');
        } else if (isRequired) {
            const badge = document.createElement('span');
            badge.className = 'badge required';
            badge.textContent = 'Bắt buộc';
            label.appendChild(badge);
            group.classList.remove('optional', 'disabled');
        } else if (predictResult.canPredict) {
            const badge = document.createElement('span');
            badge.className = 'badge optional';
            badge.textContent = 'Không cần thiết';
            label.appendChild(badge);
            group.classList.add('optional');
        } else {
            const badge = document.createElement('span');
            badge.className = 'badge optional';
            badge.textContent = 'Tùy chọn';
            label.appendChild(badge);
            group.classList.add('optional');
        }
    });
    
    if (predictResult.canPredict && predictResult.prediction) {
        const resultDiv = document.getElementById('predictionResult');
        resultDiv.innerHTML = `
            <div>🎯 Kết quả dự đoán: <strong>${predictResult.prediction}</strong></div>
            <div style="font-size: 0.9em; margin-top: 10px; opacity: 0.95;">
                ${predictResult.optionalFields.length > 0 
                    ? `Các trường còn lại không ảnh hưởng đến kết quả này` 
                    : 'Đã sử dụng tất cả thông tin có sẵn'}
            </div>
        `;
        resultDiv.style.display = 'block';
    } else {
        document.getElementById('predictionResult').style.display = 'none';
    }
}

function resetPredictionForm() {
    const features = headers.filter(h => h !== targetColumn && !ignoreColumns.includes(h));
    
    features.forEach(feature => {
        const input = document.getElementById(`input_${feature}`);
        if (input) input.value = '';
        
        const group = document.getElementById(`group_${feature}`);
        const label = group.querySelector('label');
        
        const oldBadge = label.querySelector('.badge');
        if (oldBadge) oldBadge.remove();
        
        const badge = document.createElement('span');
        badge.className = 'badge required';
        badge.textContent = 'Bắt buộc';
        label.appendChild(badge);
        
        group.classList.remove('optional', 'disabled');
    });
    
    document.getElementById('predictionResult').style.display = 'none';
}

// ==========================================
// TREE VISUALIZATION
// ==========================================
document.getElementById('showTreeBtn').addEventListener('click', function() {
    const viz = document.getElementById('treeVisualization');
    
    if (viz.style.display === 'none') {
        viz.style.display = 'block';
        viz.innerHTML = '<div class="tree-container">' + renderTreeVisual(decisionTree) + '</div>';
        this.textContent = '🙈 Ẩn cây quyết định';
    } else {
        viz.style.display = 'none';
        this.textContent = '👁️ Xem cây quyết định';
    }
});

// Chỉ sửa hàm renderTreeVisual và thêm hàm getSubtreeWidth, giữ nguyên code khác

function getSubtreeWidth(node) {
    if (!node || node.isLeaf) return 220; // Base width for leaf or small node
    
    const childValues = Object.keys(node.children);
    if (childValues.length === 0) return 220;
    
    // Tính width recursive: tổng width con + gaps (20px mỗi gap)
    let totalChildWidth = 0;
    childValues.forEach(value => {
        totalChildWidth += getSubtreeWidth(node.children[value]);
    });
    
    const gaps = (childValues.length - 1) * 20;
    return Math.max(220, totalChildWidth + gaps);
}

function renderTreeVisual(node) {
    if (!node) return '';
    
    const subtreeWidth = getSubtreeWidth(node);
    
    let html = `<div class="tree-wrapper" style="width: ${subtreeWidth}px;">`;
    
    if (node.isLeaf) {
        html += `
            <div class="tree-node leaf">
                <span class="icon">📋</span>
                <div class="feature-name">Kết quả: ${node.value}</div>
                <div class="samples">${node.samples} samples</div>
            </div>
        `;
    } else {
        // Node cha
        html += `
            <div class="tree-node">
                <span class="icon">❓</span>
                <div class="feature-name">${node.feature}</div>
                <div class="samples">${node.samples} samples</div>
            </div>
        `;
        
        const childValues = Object.keys(node.children);
        const numChildren = childValues.length;
        
        if (numChildren > 0) {
            // Phần connector: horizontal bar + vertical bars
            html += `
                <div class="branch-connector" style="width: ${subtreeWidth}px;">
                    <div class="horizontal-bar"></div>
                    <div class="vertical-bars">
            `;
            // Tạo vertical bar cho từng con
            for (let i = 0; i < numChildren; i++) {
                html += '<div class="v-bar"></div>';
            }
            html += `
                    </div>
                </div>
                
                <!-- Các nhánh con -->
                <div class="tree-children" style="width: ${subtreeWidth}px;">
            `;
            
            childValues.forEach(value => {
                html += `
                    <div class="child-branch">
                        <div class="branch-label">${value}</div>
                        ${renderTreeVisual(node.children[value])}
                    </div>
                `;
            });
            
            html += `</div>`;
        }
    }
    
    html += '</div>';
    return html;
}
// ==========================================
// CALCULATIONS DISPLAY
// ==========================================
document.getElementById('showCalculationsBtn').addEventListener('click', function() {
    const calc = document.getElementById('calculationsDisplay');
    
    if (calc.style.display === 'none') {
        calc.style.display = 'block';
        displayCalculations();
        this.textContent = '🙈 Ẩn tính toán';
    } else {
        calc.style.display = 'none';
        this.textContent = '📊 Chi tiết tính toán';
    }
});

function displayCalculations() {
    const calc = document.getElementById('calculationsDisplay');
    let html = '<h3 style="color: #667eea; margin-bottom: 20px;">📊 Chi tiết tính toán ID3</h3>';
    
    calculationSteps.forEach((step, idx) => {
        if (step.type === 'dataset_entropy') {
            html += `
                <div class="calc-section">
                    <h3>Bước ${idx + 1}: Tính Entropy của Dataset</h3>
                    <div class="calc-formula">
                        Entropy(S) = -Σ p(i) * log₂(p(i))
                    </div>
                    <div class="calc-result">
                        Entropy = ${step.entropy.toFixed(4)}
                    </div>
                    <div class="calc-detail">
                        Dataset có ${step.samples} mẫu
                    </div>
                </div>
            `;
        } else if (step.type === 'feature_comparison') {
            html += `
                <div class="calc-section">
                    <h3>Bước ${idx + 1}: So sánh Information Gain các Features</h3>
            `;
            
            step.features.forEach(f => {
                html += `
                    <div class="calc-detail" style="margin: 10px 0; padding: 10px; background: #f9f9f9; border-radius: 6px;">
                        <strong>${f.feature}</strong>: Information Gain = ${f.gain.toFixed(4)}
                    </div>
                `;
            });
            
            html += `
                    <div class="calc-result">
                        ✅ Feature tốt nhất: <strong>${step.bestFeature}</strong> (Gain = ${step.maxGain.toFixed(4)})
                    </div>
                </div>
            `;
        }
    });
    
    calc.innerHTML = html;
}