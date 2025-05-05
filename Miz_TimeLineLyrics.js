//=============================================================================
// Plugin Name: Miz_TimeLineLyrics
// Version: 1.1
// Author: MixLand1001
//=============================================================================

/*:
 * @plugindesc 根据给出的时间轴对应音频显示字幕。
 * @author MixLand1001
 *
 * @param Lyrics File
 * @desc 包含歌词和时间信息的文件名（放在data文件夹下面）
 * @default lyrics.lrc
 *
 * @param Offest
 * @desc 歌词的偏移数值
 * @default 0
 *
 * @param Line Separator
 * @desc LRC文件中用于分隔两个语言字幕的字符
 * @default //
 *
 * @param Font Size
 * @desc 歌词字体大小
 * @default 24
 *
 * @param Text Color
 * @desc 歌词文本颜色
 * @default white
 *
 * @param Outline Color
 * @desc 歌词描边颜色
 * @default black
 *
 * @param Outline Width
 * @desc 歌词描边宽度。
 * @default 2
 *
 * @param X Position
 * @desc 歌词在屏幕上的 X 坐标（数值或百分比 比如50%）
 * @default 50%
 *
 * @param Y Position
 * @desc 歌词在屏幕上的 Y 坐标（数值或百分比 比如50%）
 * @default 80%
 *
 * @help
 * 请将包含时间轴信息的歌词文件放在游戏的 data 文件夹下。
 * 歌词文件格式为每行 "[分钟:秒.毫秒] 歌词文本"。
 *
 * 插件命令：
 * showLyrics [文件名] - 显示指定的歌词文件。如果省略文件名，则使用插件参数中设置的文件。
 * 歌词需要是lrc文件的格式，名字需要带上文件后缀。
 * hideLyrics - 隐藏显示的歌词。
 * 如何显示双语字幕：在lrc文件中，在歌词后添加分隔符（默认是'//'）
 *
 * 请注意，需要播放BGM才能显示歌词，可以提前使用指令来提前加载歌词。
 */

(function() {

    var parameters = PluginManager.parameters('Miz_TimeLineLyrics');
    var lyricsFile = parameters['Lyrics File'] || 'lyrics.txt';
    var offSet = Number(parameters["Offset"] || 0);
    var fontSize = Number(parameters['Font Size'] || 24);
    var textColor = parameters['Text Color'] || 'white';
    var outlineColor = parameters['Outline Color'] || 'black';
    var outlineWidth = Number(parameters['Outline Width'] || 2);
    var xPosition = parameters['X Position'] || '50%';
    var yPosition = parameters['Y Position'] || '80%';
    var lineSeparator = parameters['Line Separator'] || '//';

    var _lyricsData = []; //歌词数据
    var _subLyricsData = [];
    var _currentLyricIndex = -1; //定位目前歌词位置
    var _showingLyrics = false; //是否显示歌词
    var _lyricsSprite = null;   //歌词Sprite
    var lyricBGM = {};
    var _lyricsLoaded = false;

    // 解析lrc中的时间戳
    function parseTimestamp(timestamp) {
        var parts = timestamp.match(/\[(\d+):(\d{2})\.(\d{2,3})\]/);
        if (parts) {
            var minutes = parseInt(parts[1]);
            var seconds = parseInt(parts[2]);
            var milliseconds = parseInt(parts[3]);
            return minutes * 60 + seconds + milliseconds / (parts[3].length === 2 ? 100 : 1000);
        }
        return -1;
    }

   // 加载歌词文件
    function loadLyricsFile(filename, callback) {
        var xhr = new XMLHttpRequest();
        var url = 'data/' + filename;
        xhr.overrideMimeType('text/plain; charset=utf-8');
        xhr.onload = function() {
            if (xhr.status < 400) {
                callback(xhr.responseText);
            } else {
                console.error('加载歌词文件失败：', url);
                callback(null);
            }
        };
        xhr.onerror = function() {
            console.error('加载歌词文件失败：', url);
            callback(null);
        };
        xhr.open('GET', url);
        xhr.send();
    }

    // 解析歌词文本
    function parseLyricsText(text) {
        var lines = text.split('\n');
        var lyrics = [];
        var separatorRegex = new RegExp('\\s*\\' + lineSeparator + '\\s*');

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (line) {
                var timestamp = parseTimestamp(line);
                if (timestamp !== -1) {
                    var lyricText = line.substring(line.indexOf(']') + 1).trim();
                    var textParts = lyricText.split(separatorRegex, 2); 
                    lyrics.push({ time: timestamp, text: textParts[0].trim() });
                    _subLyricsData.push({text:textParts.length>1? textParts[1].trim() : ""});
                }
            }
        }
        lyrics.sort(function(a, b) {
            return a.time - b.time;
        });
        return lyrics;
    }

    // 创建歌词 Sprite
    function createLyricsSprite() {
        var sprite = new Sprite(new Bitmap(Graphics.width, Graphics.height));
        sprite.x = 0;
        sprite.y = 0;
        sprite.anchor.x = parseFloat(String(xPosition).endsWith('%') ? parseFloat(xPosition) / 100 : 0);
        sprite.anchor.y = parseFloat(String(yPosition).endsWith('%') ? parseFloat(yPosition) / 100 : 0);
        sprite.x = String(xPosition).endsWith('%') ? Graphics.width * parseFloat(xPosition) / 100 : parseFloat(xPosition);
        sprite.y = String(yPosition).endsWith('%') ? Graphics.height * parseFloat(yPosition) / 100 : parseFloat(yPosition);
        sprite.bitmap.fontFace = "GameFont";
        sprite.bitmap.fontSize = fontSize;
        sprite.bitmap.textColor = textColor;
        sprite.bitmap.outlineColor = outlineColor;
        sprite.bitmap.outlineWidth = outlineWidth;
        sprite.visible = false;
        return sprite;
    }

    // 更新歌词显示
    function updateLyricsDisplay() {
        if (!_showingLyrics || !_lyricsData || _lyricsData.length === 0 || !_lyricsLoaded) {
            return;
        }

        if(lyricBGM && _lyricsSprite){
            if(lyricBGM != AudioManager._currentBgm){
                _lyricsSprite.visible = false;
            }else{
                _lyricsSprite.visible = true;
            }
        }

        var currentTime =  AudioManager._bgmBuffer && AudioManager._bgmBuffer.isPlaying() ? AudioManager._bgmBuffer.seek() : 0; // 获取 BGM 播放时间


        var newLyricIndex = -1;
        for (var i = 0; i < _lyricsData.length; i++) {
            if (currentTime + offSet  >= _lyricsData[i].time) {
                newLyricIndex = i;
            } else {
                break;
            }
        }

        if (newLyricIndex !== _currentLyricIndex) {
            _currentLyricIndex = newLyricIndex;
            _lyricsSprite.bitmap.clear();

            if (_currentLyricIndex >= 0 && _currentLyricIndex < _lyricsData.length) {
                var width = _lyricsSprite.bitmap.measureTextWidth(_lyricsData[_currentLyricIndex].text);
                _lyricsSprite.bitmap.drawText(_lyricsData[_currentLyricIndex].text, _lyricsSprite.x - width / 2,_lyricsSprite.y, Graphics.width, fontSize);
                if(_subLyricsData && _subLyricsData[_currentLyricIndex]){
                    _lyricsSprite.bitmap.drawText(_subLyricsData[_currentLyricIndex].text, _lyricsSprite.x - width / 2,_lyricsSprite.y+ fontSize, Graphics.width, fontSize);
                }
            }
        }
    }

    // 插件命令
    var _Game_Interpreter_pluginCommand = Game_Interpreter.prototype.pluginCommand;
    Game_Interpreter.prototype.pluginCommand = function(command, args) {
        _Game_Interpreter_pluginCommand.call(this, command, args);
        if (command === 'showLyrics') {
            var filename = args[0] || lyricsFile;
            offSet = Number(args[1]) || 0;
            loadLyricsFile(filename, function(text) {
                if (text) {
                    _lyricsData = parseLyricsText(text);
                    if (!_lyricsSprite) {
                        _lyricsSprite = createLyricsSprite();
                        SceneManager._scene.addChild(_lyricsSprite);
                    }
                    _lyricsSprite.visible = true;
                    _showingLyrics = true;
                    _currentLyricIndex = -1;
                    _lyricsLoaded = true; 
                }
            });
        } else if (command === 'hideLyrics') {
            if (_lyricsSprite) {
                _lyricsSprite.visible = false;
                _showingLyrics = false;
                _currentLyricIndex = -1;
            }
        } else if (command === 'playLyricsBGM') {
            var bgmFile = args[0];
            var volume = Number(args[1]) || 100;
            var pitch = Number(args[2]) || 100;
            var pan = Number(args[3]) || 0;

            // 使用一个 Promise 来等待歌词加载完毕
            var waitForLyrics = new Promise(resolve => {
                let checkInterval = setInterval(() => {
                    if (_lyricsLoaded) {
                        clearInterval(checkInterval); // 停止检查
                        resolve(); // Promise resolved
                    }
                }, 100); // 每 100 毫秒检查一次
            });

            waitForLyrics.then(() => {
                if (bgmFile) {
                    var bgm = {
                        name: bgmFile,
                        volume: volume,
                        pitch: pitch,
                        pan: pan
                    };
                    AudioManager.playBgm(bgm);
                    lyricBGM = AudioManager._currentBgm;
                }
            });
        }
    };

    // 精灵持久化
    var _Scene_Map_CreateDisplayObjects = Scene_Map.prototype.createDisplayObjects;
    Scene_Map.prototype.createDisplayObjects = function() {
        _Scene_Map_CreateDisplayObjects.call(this);
        if(_showingLyrics){
            this.addChild(_lyricsSprite);
        }
    };

    // 在场景中添加更新逻辑
    var _Scene_Base_update = Scene_Base.prototype.update;
    Scene_Base.prototype.update = function() {
        _Scene_Base_update.call(this);
        if (_showingLyrics && SceneManager._scene instanceof Scene_Map || SceneManager._scene instanceof Scene_Battle) {
            updateLyricsDisplay();
        }
    };

})();