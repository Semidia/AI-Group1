// sync-help-content.js
// 自动将帮助按钮内容从md文件同步到前端js文件
// 支持两种模式：直接运行单次同步，或添加 --watch 参数进行自动监听
const fs = require('fs');
const path = require('path');

// 定义文件路径
const rootDir = path.join(__dirname);
const mdPath = path.join(rootDir, 'github小组开发库说明书', '帮助按钮里的内容.md');
const jsPath = path.join(rootDir, '前端', 'src', 'engine', 'helpContent.js');

// 同步函数
function syncHelpContent() {
    try {
        // 读取md文件内容
        const mdContent = fs.readFileSync(mdPath, 'utf8');
        
        // 生成js文件内容
        const jsContent = `// Help content for the Help Modal

// Auto-generated from github小组开发库说明书/帮助按钮里的内容.md
// 运行 node sync-help-content.js 可更新
// 添加 --watch 参数可启用自动监听

export const helpContent = \`${mdContent}\`;
`;
        
        // 写入js文件
        fs.writeFileSync(jsPath, jsContent, 'utf8');
        
        console.log('✅ 帮助内容同步成功！');
        console.log('📌 更新时间:', new Date().toLocaleString());
        
    } catch (error) {
        console.error('❌ 同步失败:', error.message);
        return false;
    }
    return true;
}

// 检查是否需要监听模式
const isWatchMode = process.argv.includes('--watch') || process.argv.includes('-w');

if (isWatchMode) {
    // 先执行一次同步
    syncHelpContent();
    
    // 添加文件监听
    fs.watch(mdPath, (eventType, filename) => {
        if (eventType === 'change' && filename) {
            console.log('\n🔄 检测到帮助按钮内容.md 已修改，正在同步...');
            syncHelpContent();
        }
    });
    
    console.log('\n👁️  已启动自动监听模式');
    console.log('📝 直接修改 github小组开发库说明书/帮助按钮里的内容.md 即可自动更新游戏按钮内容');
    console.log('⏹️  按 Ctrl+C 可停止监听');
    
    // 防止进程退出
    process.stdin.resume();
} else {
    // 单次同步模式
    const success = syncHelpContent();
    console.log('📌 提示：添加 --watch 参数可启用自动监听模式');
    process.exit(success ? 0 : 1);
}