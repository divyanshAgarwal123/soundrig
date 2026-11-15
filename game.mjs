// Arcade collision foundation adapted from Phaser's MIT first-game tutorial.
// Pressing-room art, route, character, feedback and input behavior are SoundRig work.
import {attachPhaserScene} from './game-adapter.mjs';
import {createJumpGate} from './game-controls.mjs';
export function createGame(parent, hooks = {}) {
  const host = document.getElementById(parent);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ownsKeyboard = () => host === document.activeElement || host.contains(document.activeElement);
  const keyboardHeld = {left: false, right: false, up: false};
  const arrows = {ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ' ': 'up', a: 'left', d: 'right', w: 'up'};
  const jumpGate = createJumpGate();
  const clearKeyboard = () => { for (const key of Object.keys(keyboardHeld)) keyboardHeld[key] = false; jumpGate.clear(); };
  const focusGame = () => host.focus({preventScroll: true});
  const gameKey = (event, pressed) => {
    const key = arrows[event.key];
    if (ownsKeyboard() && key) { event.preventDefault(); if (key === 'up' && pressed && !keyboardHeld.up) jumpGate.press(scene?.time.now ?? 0); keyboardHeld[key] = pressed; }
  };
  const keyDown = event => gameKey(event, true), keyUp = event => gameKey(event, false);
  host.addEventListener('pointerdown', focusGame);
  host.addEventListener('keydown', keyDown); host.addEventListener('keyup', keyUp);
  host.addEventListener('blur', clearKeyboard, true); window.addEventListener('blur', clearKeyboard);
  let player, records, press, scene, score = 0, gameOver = false, manuallyPaused = false;
  let previousGrounded = false, previousVelocity = 0, lastLanding = -1000;
  const held = {left: false, right: false, jump: false};
  const snapshot = {speed: 0, air: 0, grounded: 0, alive: 1, x: 80, y: 510, score: 0, landings: 0, pickups: 0, hits: 0, phase: 'playing', total: 8};
  const emit = (name, intensity = 1) => {if(hooks.audio)scene.events.emit({land:'landed',pickup:'collected',hurt:'damaged'}[name],intensity);hooks.event?.(name,intensity);};
  const clamp = n => Math.max(0, Math.min(1, n));
  const game = new Phaser.Game({
    type: Phaser.CANVAS, width: 800, height: 600, parent, backgroundColor: '#e8dfcc',
    scale: {mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH},
    render: {antialias: true},
    physics: {default: 'arcade', arcade: {gravity: {y: 300}, debug: false}},
    scene: {create, update},
  });
  function create() {
    scene = this; score = 0; gameOver = false; manuallyPaused = false;
    previousGrounded = false; previousVelocity = 0; lastLanding = -1000; clearKeyboard();
    Object.assign(snapshot, {speed: 0, air: 0, grounded: 0, alive: 1, x: 80, y: 510, score: 0, landings: 0, pickups: 0, hits: 0, phase: 'playing'});
    const art = this.make.graphics({x: 0, y: 0, add: false});
    const texture = (key, w, h, paint) => { if (this.textures.exists(key)) return; art.clear(); paint(art); art.generateTexture(key, w, h); };
    texture('sr-room', 800, 600, g => {
      g.fillStyle(0xe8dfcc);g.fillRect(0,0,800,600);
      // Glazed factory windows, steel mullions, and a paper-coloured wall.
      g.fillStyle(0xc4c9b6);g.fillRoundedRect(40,36,720,360,8);
      g.fillStyle(0xd7d9c3);g.fillRect(51,47,698,338);
      g.fillStyle(0xbac2ad);g.fillPoints([{x:52,y:280},{x:280,y:47},{x:370,y:47},{x:52,y:365}],true);
      for (let x=40;x<780;x+=144){g.fillStyle(0xaaa992);g.fillRect(x,36,8,360);g.fillStyle(0xe8dfcc);g.fillRect(x+8,36,3,360);}
      for (const y of [152,270,388]){g.fillStyle(0xaaa992);g.fillRect(40,y,720,7);}
      g.fillStyle(0xd4c9b4);g.fillRect(0,398,800,202);
      g.fillStyle(0xddd3c0);g.fillRect(0,402,800,140);
      g.fillStyle(0xaaa992);g.fillRect(0,398,800,4);
      // Service piping and a wall clock are quiet environmental details.
      g.lineStyle(8,0xb7b29c);g.lineBetween(24,0,24,456);g.lineBetween(24,456,84,456);
      g.fillStyle(0xeee6d3);g.fillCircle(702,90,27);g.lineStyle(3,0x696b5b);g.strokeCircle(702,90,27);g.lineBetween(702,90,702,73);g.lineBetween(702,90,715,96);
      // Stationary machinery and stacked shipping sleeves sit behind the route.
      g.fillStyle(0xb5b79f);g.fillRoundedRect(445,398,160,145,8);
      g.fillStyle(0x8f9680);g.fillRoundedRect(463,415,124,48,4);
      g.fillStyle(0xced0b7);g.fillCircle(525,439,16);g.fillStyle(0x696b5b);g.fillCircle(525,439,6);
      g.lineStyle(3,0x8f9680);for(let y=480;y<530;y+=12)g.lineBetween(465,y,583,y);
      for(const [x,y,w,h]of [[38,470,76,72],[116,498,55,44],[332,493,72,49],[738,470,60,72]]){
        g.fillStyle(0xbaa98a);g.fillRect(x,y,w,h);g.lineStyle(2,0x9d8d71);g.strokeRect(x,y,w,h);g.fillStyle(0xd1c3a7);g.fillRect(x+w*.4,y,12,h);g.fillStyle(0xeee6d3);g.fillRect(x+9,y+12,23,14);
      }
      g.fillStyle(0x303b32);g.fillRect(0,549,800,51);g.fillStyle(0x696b5b);g.fillRect(0,549,800,5);
      for(let x=0;x<800;x+=50){g.fillStyle(0x525b4a);g.fillRect(x,576,29,3);}
    });
    texture('sr-platform', 280, 26, g => {
      g.fillStyle(0x303b32);g.fillRoundedRect(0,0,280,26,4);g.fillStyle(0xa6ad91);g.fillRect(0,0,280,5);g.fillStyle(0xcd653c);g.fillRect(5,8,270,11);
      for(let x=12;x<275;x+=30){g.fillStyle(0xeddcc0);g.fillCircle(x,13,2);}
    });
    for(let frame=0;frame<6;frame++)texture('sr-courier-'+frame,48,60,g=>{
      const stride=[0,3,6,0,-6,-3][frame];
      g.fillStyle(0x4d5549);g.fillRoundedRect(2,20,12,27,3);g.fillStyle(0xb7b99e);g.fillCircle(8,31,7);g.fillStyle(0x303b32);g.fillCircle(8,31,3);
      g.fillStyle(0x303b32);g.fillRoundedRect(11,31,27,19,5);
      g.fillStyle(0x303b32);g.fillRect(15+stride,45,7,12);g.fillRect(28-stride,45,7,12);
      g.fillStyle(0x59634e);g.fillRoundedRect(12+stride,54,12,5,2);g.fillRoundedRect(26-stride,54,13,5,2);
      g.fillStyle(0xece4cc);g.fillRoundedRect(11,8,31,28,8);g.fillStyle(0x303b32);g.fillRoundedRect(16,17,26,12,4);
      g.fillStyle(0xede3bf);g.fillRect(23,20,4,5);g.fillRect(34,20,4,5);
      g.fillStyle(0xd96d40);g.fillRoundedRect(9,6,35,9,3);g.fillRect(20,3,16,5);g.fillRect(39,13,7,4);
      g.fillStyle(0xd96d40);g.fillRect(18,34,13,5);g.fillStyle(0xece4cc);g.fillCircle(36,40,4);
    });
    texture('sr-record',32,32,g=>{g.fillStyle(0x303b32);g.fillCircle(16,16,15);g.lineStyle(1,0x727763);g.strokeCircle(16,16,11);g.strokeCircle(16,16,13);g.fillStyle(0xd96d40);g.fillCircle(16,16,7);g.fillStyle(0xeee6d3);g.fillCircle(16,16,2);});
    texture('sr-press',40,40,g=>{g.fillStyle(0x303b32);g.fillCircle(20,20,19);g.fillStyle(0xcd653c);g.fillCircle(20,20,15);g.lineStyle(3,0xeee0c7);g.lineBetween(10,10,30,30);g.lineBetween(30,10,10,30);g.fillStyle(0x303b32);g.fillCircle(20,20,6);});
    art.destroy();this.add.image(400,300,'sr-room');
    const label=(x,y,text,size=12,color='#656954')=>this.add.text(x,y,text,{fontFamily:'DM, sans-serif',fontSize:size,color,fontStyle:'bold',letterSpacing:1});
    label(65,61,'SOUNDRIG / PRESSING ROOM',13);label(65,82,'MASTERS IN TRANSIT',10);
    label(59,431,'DISPATCH',10);label(455,401,'PRESS 08',10);label(623,193,'SIDE B',11);
    const platforms = this.physics.add.staticGroup();
    const shelf=(x,y,w)=>{const item=platforms.create(x,y,'sr-platform').setDisplaySize(w,26).refreshBody();Object.assign(item.body.checkCollision,{down:false,left:false,right:false});return item;};
    shelf(400,562,800);shelf(210,420,280);shelf(555,300,300);shelf(240,180,270);
    const supports=this.add.graphics();supports.lineStyle(6,0x969b83);for(const [x,y]of [[92,433],[328,433],[427,313],[683,313],[127,193],[352,193]]){supports.lineBetween(x,y,x,y+31);supports.lineBetween(x,y+31,x+24,y);}
    player = this.physics.add.sprite(80,510,'sr-courier-0');player.setSize(25,49).setOffset(12,9);player.setBounce(0);player.setCollideWorldBounds(true);
    records=this.physics.add.staticGroup();
    for(const [x,y]of [[190,525],[383,525],[615,525],[125,390],[305,390],[475,270],[655,270],[235,150]])records.create(x,y,'sr-record').setCircle(14,2,2);
    press=this.physics.add.sprite(707,529,'sr-press');press.body.setAllowGravity(false);press.setCircle(18,2,2);press.setImmovable(true);
    this.physics.add.collider(player,platforms);
    this.physics.add.overlap(player,records,collectRecord,null,this);
    this.physics.add.overlap(player,press,hitPress,null,this);
    const step = () => {
      const grounded = player.body.blocked.down || player.body.touching.down;
      if (!gameOver && grounded && !previousGrounded && previousVelocity > 80 && this.time.now - lastLanding > 180) {
        snapshot.landings++;lastLanding=this.time.now;emit('land',clamp(previousVelocity/500));if(!reducedMotion)burst(player.x,player.y+27,0xaaa992,4);
      }
      Object.assign(snapshot,{speed:gameOver?0:clamp(Math.abs(player.body.velocity.x)/160),air:gameOver||grounded?0:clamp(Math.abs(player.body.velocity.y)/330),grounded:grounded?1:0,alive:gameOver?0:1,x:player.x,y:player.y,score});
      previousGrounded=grounded;previousVelocity=player.body.velocity.y;hooks.state?.({...snapshot});
    };
    const world=this.physics.world;
    world.on('worldstep', step);
    this.events.once('shutdown', () => world.off('worldstep', step));
    if(hooks.audio){const audio=attachPhaserScene(this,{...hooks.audio,readState:()=>({vx:player.body.velocity.x,vy:player.body.velocity.y,onGround:player.body.blocked.down||player.body.touching.down,gameOver})});hooks.audioReady?.(audio);}
    hooks.state?.({...snapshot});hooks.ready?.();
  }
  function burst(x,y,color,count=7){
    for(let i=0;i<count;i++){const bit=scene.add.rectangle(x,y,4,4,color);scene.tweens.add({targets:bit,x:x+Math.cos(i*2.4)*30,y:y-12-Math.sin(i*2.4)*20,alpha:0,angle:i*40,duration:400,onComplete:()=>bit.destroy()});}
  }
  function update(time,delta) {
    if(gameOver)return;
    const keyboard=ownsKeyboard(),left=held.left||(keyboard&&keyboardHeld.left),right=held.right||(keyboard&&keyboardHeld.right);
    const target=left===right?0:left?-160:160;
    player.setVelocityX(Phaser.Math.Linear(player.body.velocity.x,target,Math.min(1,delta/65)));
    if(Math.abs(player.body.velocity.x)<1)player.setVelocityX(0);
    if(target)player.setFlipX(target<0);
    const grounded=player.body.touching.down||player.body.blocked.down;
    if(jumpGate.step(time,grounded))player.setVelocityY(-330);
    player.setTexture('sr-courier-'+(grounded&&Math.abs(player.body.velocity.x)>15?Math.floor(time/80)%6:0));
    press.setVelocityX(Math.cos(time/900)*45);press.rotation=reducedMotion?0:time/500;
    // The rolling press stays within a bounded bay instead of accumulating drift.
    if(press.x<662)press.x=662;if(press.x>752)press.x=752;
  }
  function collectRecord(_player,record){
    if(gameOver)return;record.disableBody(true,true);score+=10;snapshot.pickups++;emit('pickup');
    if(!reducedMotion)burst(record.x,record.y,0xd96d40);
    if(records.countActive(true)===0)finish('complete');
  }
  function finish(phase){
    gameOver=true;scene.physics.pause();player.setVelocity(0,0);clearKeyboard();
    Object.assign(snapshot,{phase,alive:0,speed:0,air:0,score});hooks.state?.({...snapshot});
    scene.add.rectangle(400,300,800,600,0x20221c,.72);
    const title=phase==='complete'?'SIDE A. COMPLETE.':'A BUMP IN THE MIX.';
    scene.add.text(400,264,title,{fontFamily:'SoundRigDisplay, sans-serif',fontSize:34,color:'#f2eadc',align:'center'}).setOrigin(.5);
    scene.add.text(400,315,phase==='complete'?'Eight masters delivered. Try your next sound revision.':'Restart the scene to try the route again.',{fontFamily:'DM, sans-serif',fontSize:17,color:'#f2eadc'}).setOrigin(.5);
  }
  function hitPress(){if(gameOver)return;snapshot.hits++;emit('hurt');player.setTint(0xcd653c);finish('failed');}
  return {
    getState:()=>({...snapshot}),
    restart:()=>{clearKeyboard();for(const key of Object.keys(held))held[key]=false;manuallyPaused=false;scene?.scene.restart();},
    hold:(key,pressed)=>{if(key in held){if(key==='jump'&&pressed&&!held.jump)jumpGate.press(scene?.time.now??0);held[key]=Boolean(pressed);}},
    jump:()=>jumpGate.press(scene?.time.now??0),
    togglePause:()=>{if(gameOver)return;manuallyPaused=!manuallyPaused;clearKeyboard();for(const key of Object.keys(held))held[key]=false;snapshot.phase=manuallyPaused?'paused':'playing';if(manuallyPaused)scene.sys.pause();else scene.sys.resume();hooks.state?.({...snapshot});},
    // ScenePlugin operations queue until the next frame; pause commits before replay audio.
    pause: () => { clearKeyboard(); for (const key of Object.keys(held)) held[key] = false; scene?.sys.pause(); },
    resume: () => {if(!manuallyPaused)scene?.sys.resume();},
    destroy:()=>{host.removeEventListener('pointerdown',focusGame);host.removeEventListener('keydown',keyDown);host.removeEventListener('keyup',keyUp);host.removeEventListener('blur',clearKeyboard,true);window.removeEventListener('blur',clearKeyboard);game.destroy(true);},
  };
}
