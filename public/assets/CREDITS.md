
## audio

All audio is by **Juhani Junkala (SubspaceAudio)**, license **CC0 1.0 (public domain)**, re-encoded with ffmpeg to 96 kbps MP3.

Music - "5 Chiptunes (Action)", https://opengameart.org/content/5-chiptunes-action

- `music/menu.mp3` <- https://opengameart.org/sites/default/files/title%20screen.mp3
- `music/grass.mp3` <- https://opengameart.org/sites/default/files/level1.mp3
- `music/desert.mp3`, `music/night.mp3` <- https://opengameart.org/sites/default/files/level2.mp3
- `music/cave.mp3`, `music/castle.mp3` <- https://opengameart.org/sites/default/files/level3.mp3
- `music/snow.mp3` <- https://opengameart.org/sites/default/files/ending.mp3

Jingles and sound effects - "512 Sound Effects (8-bit style)", https://opengameart.org/content/512-sound-effects-8-bit-style
(https://opengameart.org/sites/default/files/The%20Essential%20Retro%20Video%20Game%20Sound%20Effects%20Collection%20%5B512%20sounds%5D.zip)

- `sfx/jump.mp3` <- `sfx_movement_jump1.wav`
- `sfx/coin.mp3` <- `sfx_coin_double1.wav`
- `sfx/stomp.mp3` <- `sfx_sounds_impact1.wav`
- `sfx/hurt.mp3` <- `sfx_sounds_damage1.wav`
- `sfx/die.mp3` <- `sfx_deathscream_human1.wav`
- `sfx/checkpoint.mp3` <- `sfx_sounds_powerup1.wav`
- `sfx/heart.mp3` <- `sfx_sounds_powerup2.wav`
- `sfx/win.mp3` <- `sfx_sounds_fanfare1.wav`
- `sfx/gameover.mp3` <- `sfx_sounds_falling1.wav`
- `sfx/select.mp3` <- `sfx_menu_select1.wav`
- `sfx/bump.mp3` <- `sfx_sounds_impact2.wav`
- `music/gameover.mp3` <- `sfx_sounds_negative1.wav`
- `music/win.mp3` <- first 7 s (faded out) of https://opengameart.org/sites/default/files/ending.mp3 from "5 Chiptunes (Action)" (same author, CC0)

Synthesized fallback sounds in `public/audio.js` are original code (no third-party audio).

## sprites
All files below are **generated** (original procedural pixel art drawn with Python + Pillow for this project, no third-party
assets included, released under CC0 1.0):
- `enemies/{walker,beetle,flyer,spiky,jumper,ghost,popper}_1.png` / `_2.png` - generated
- `items/coin_1.png`..`coin_4.png`, `items/heart.png`, `items/spikes.png`, `items/checkpoint.png`, `items/checkpoint_on.png` - generated
- `themes/{desert,cave,snow,castle,night}/block.png`, `block2.png`, `bg.png` - generated
