import { FreeCamera, TargetCamera, SceneLoader, SpriteManager, Sprite, DeviceSourceManager, DeviceSource, DeviceType, DualShockInput, DualShockButton, SwitchInput, XboxInput, GenericController } from "@babylonjs/core";
import { Engine } from "@babylonjs/core/Engines/engine";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector2, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { IDisposable, Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import "@babylonjs/loaders/glTF"
import "@babylonjs/inspector";

class AnimationStateBase {
    spritePlayer: Sprite;
    from: number; /* what "frame" on our spritesheet does this start at? */
    to: number; /* what "frame" on our spritesheet does this end at? */
    speed: number; /* how long in ms is each frame of this animation? */
    loop: boolean; /* should this animation loop? */
    onAnimationEnd: () => void = () => {}; /* do we want to define a callback for this animation finishing? */
    canCancelAfter: number; /* when can the player cancel this animation into a dash animation? */
    update () {};
    start () {};
    stop () {};
    doMovement() {};
    public playAnimation () {
        this.spritePlayer.playAnimation(this.from, this.to, this.loop, this.speed, this.onAnimationEnd);
    }
}

class AnimationState extends AnimationStateBase {

}

class Attack extends AnimationState {
    hitboxes: Mesh[];
    startupFrames: number /* how many "frames" does it take before our hitbox becomes active? */
    activeFrames: number; /* how long is our hitbox active for? */
    recoveryFrames: number; /* how long is the player unable to do any other actions after the move deactivates? */
    hitstun: number; /* how long is the player stuck in a hit animation after being hit by this attack? */
    launchDirection: Vector2; /* where should the player be launched after being hit by this attack? */
}

class Player implements IDisposable{
    private _scene: Scene;
    private _playerIndex: number;

    public static player1SpriteManager: SpriteManager;
    public static player2SpriteManager: SpriteManager;

    private _transform: TransformNode;
    private _spritePlayerTransform: TransformNode;
    private _spritePlayerOffset: Vector3 = new Vector3(0, 0.5, 0);

    /* input variables */
    private _deviceSource: DeviceSource<any>;
    private _moveInput: Vector2 = new Vector2();
    private _jumpInput: boolean;
    private _dashInput: boolean;
    private _lightAttackInput: boolean;
    private _heavyAttackInput: boolean;
    private _switchGunInput: boolean;

    /* player state variables */
    private _canMove: boolean;
    private _canJump: boolean;
    private _grounded: boolean;
    private _canBeHit: boolean;
    private _canWallRun: boolean;
    private _isWallRunning: boolean;
    private _wallRunningJump: boolean;
    private _isWallStuck: boolean;
    private _hitTimer: number;
    private _ammoCount: number;
    private _currentAnimation: AnimationState;
    private _flipped: boolean = false; /* true means that the player is facing left (-X), false means the player is facing right (+X) */

    /* physics related variables */
    private _gravity: Vector2;
    private _groundRaycastDirection: Vector2;
    private _wallRaycastDirection: Vector2;
    private _knockbackDirection: Vector2;
    private _wallCollider: Mesh;
    private _hurtboxes: Mesh[];
    private _hitboxes: Mesh[];

    /* movement related variables */
    private _moveSpeed: number;
    private _dashSpeed: number;
    private _dashTimer: number;
    private _dashTimeMax: number;

    /* Animation variables */
    private _spritePlayer: Sprite;

    private _idleAnimation: AnimationState = new AnimationState();
    private _runAnimation: AnimationState = new AnimationState();
    private _jumpAnimation: AnimationState = new AnimationState();
    private _fallAnimation: AnimationState = new AnimationState();
    private _hitAnimation: AnimationState = new AnimationState();
    private _landAnimation: AnimationState = new AnimationState();
    private _dashAnimation: AnimationState = new AnimationState();
    private _idleGunAnimation: AnimationState = new AnimationState();
    private _runGunAnimation: AnimationState = new AnimationState();
    private _jumpGunAnimation: AnimationState = new AnimationState();
    private _fallGunAnimation: AnimationState = new AnimationState();
    private _hitGunAnimation: AnimationState = new AnimationState();
    private _landGunAnimation: AnimationState = new AnimationState();
    private _dashGunAnimation: AnimationState = new AnimationState();

    /* Attack variables */
    private _light1Attack: Attack = new Attack();
    private _light2Attack: Attack = new Attack();
    private _light3Attack: Attack = new Attack();
    private _heavy1Attack: Attack = new Attack();
    private _jumpKickAttack: Attack = new Attack();
    private _jumpDiveKickAttack: Attack = new Attack();
    private _shootGunAttack: Attack = new Attack();
    private _jumpShootGunAttack: Attack = new Attack();

    /* constructor */
    constructor(scene: Scene, playerIndex: number, deviceSource: DeviceSource<any>) {
        console.log("Adding player - " + playerIndex);
        this._scene = scene;
        this._playerIndex = playerIndex;
        this._deviceSource = deviceSource;
        this._init().then(() => {
            this._scene.onBeforeRenderObservable.add(() => {
                if (this._currentAnimation){
                    this._currentAnimation.update();
                }
                this._onBeforeRender();
            });
        });
    }

    private _init(): Promise<any> {
        const promises: Promise<any>[] = []
        this._transform = new TransformNode(this._getPlayerName(), this._scene);

        promises.push(this._setupAnimations());
        return Promise.all(promises).then(() => {
            return Promise.resolve();
        });
    }

    /* Animations */
    private _setupAnimations(): Promise<any>{
        this._setupSpritePlayer();

        /* NOTE: The animation frame data can be defined and loaded from JSON, or some other
                 source if you want to support extensible animations, but for the
                 sake of implementation complexity, I decided to statically define
                 the animation and state logic. */

        /* idle frame data and transition logic */
        this._idleAnimation.spritePlayer = this._spritePlayer;
        this._idleAnimation.from = 0;
        this._idleAnimation.to = 17;
        this._idleAnimation.speed = 100;
        this._idleAnimation.canCancelAfter = 0;
        this._idleAnimation.loop = true;
        this._idleAnimation.start = function () {
            this.playAnimation();
            console.log("entering idle state");
        };
        this._idleAnimation.stop = function () {
            console.log("leaving idle state");
        }

        /* moveAnimation */
        this._runAnimation.spritePlayer = this._spritePlayer;
        this._runAnimation.from = 18;
        this._runAnimation.to = 27;
        this._runAnimation.speed = 100;
        this._runAnimation.canCancelAfter = 0;
        this._runAnimation.loop = true;
        this._runAnimation.start = function () {
            this.playAnimation();
            console.log("entering run state");
        };
        this._runAnimation.update = () => {
            if (this._moveInput.x > 0 && this._flipped ||
                this._moveInput.x < 0 && !this._flipped ) {
                    this._flip();
            }
        }
        this._runAnimation.stop = function () {
            console.log("leaving run state");
        }

        /* */
        //_runAnimation: AnimationState = new AnimationState();
        //_jumpAnimation: AnimationState = new AnimationState();
        //_fallAnimation: AnimationState = new AnimationState();
        //_hitAnimation: AnimationState = new AnimationState();
        //_landAnimation: AnimationState = new AnimationState();
        //_dashAnimation: AnimationState = new AnimationState();
        //_idleGunAnimation: AnimationState = new AnimationState();
        //_runGunAnimation: AnimationState = new AnimationState();
        //_jumpGunAnimation: AnimationState = new AnimationState();
        //_fallGunAnimation: AnimationState = new AnimationState();
        //_hitGunAnimation: AnimationState = new AnimationState();
        //_landGunAnimation: AnimationState = new AnimationState();
        //_dashGunAnimation: AnimationState = new AnimationState();

        return Promise.resolve();
    }

    private _setupSpritePlayer(): void{
        this._spritePlayerTransform = new TransformNode(this._getPlayerName() + "_SpritePlayer", this._scene);
        this._spritePlayerTransform.setParent(this._transform);
        this._spritePlayerTransform.position.copyFrom(this._spritePlayerOffset);
        switch(this._playerIndex) {
            case 1:
            default:
                this._spritePlayer = new Sprite("Player_1_CharacterSprite", Player.player1SpriteManager);
                break;
        }

        this._scene.onBeforeRenderObservable.add(() => {
            this._spritePlayerTransform.computeWorldMatrix();
            this._spritePlayer.position.copyFrom(this._spritePlayerTransform.absolutePosition);
        });
    }

    /* Frame Update */
    private _onBeforeRender() {
        this._updateInput();
        this._doStateTransition();
        this._doMovement();
    }

    private _flip() {
        this._flipped = !this._flipped;

        /* rotate 180deg about the Y-axis to flip character orientation for locomotion computations and collider orientation */
        this._transform.rotate(Vector3.Up(), Math.PI);

        /* we need to manually tell the sprite player to render the sprite as X flipped */
        this._spritePlayer.invertU = this._flipped;
    }

    private _updateInput(): void {
        switch(this._deviceSource.deviceType) {
            case DeviceType.Keyboard:
                this._moveInput.copyFromFloats(this._deviceSource.getInput(68) - this._deviceSource.getInput(65),  // D = X+, A = X-
                                               this._deviceSource.getInput(87) - this._deviceSource.getInput(83)); // W = Y+, S = Y-
                this._jumpInput = this._deviceSource.getInput(32) != 0; // jump = space
                this._dashInput = this._deviceSource.getInput(16) != 0; // dash = shift
                this._lightAttackInput = this._deviceSource.getInput(74) != 0; // light attack = J
                this._heavyAttackInput = this._deviceSource.getInput(75) != 0; // heavy attack = K
                this._switchGunInput = this._deviceSource.getInput(76) != 0; // switch to gun = L
                break;
            case DeviceType.DualShock:
                this._moveInput.copyFromFloats(this._deviceSource.getInput(DualShockInput.LStickXAxis), this._deviceSource.getInput(DualShockInput.LStickYAxis));
                this._jumpInput = this._deviceSource.getInput(DualShockButton.Cross) != 0;
                this._dashInput = this._deviceSource.getInput(DualShockButton.R1) != 0;
                this._lightAttackInput = this._deviceSource.getInput(DualShockButton.Square) != 0;
                this._heavyAttackInput = this._deviceSource.getInput(DualShockButton.Triangle) != 0;
                this._switchGunInput = this._deviceSource.getInput(DualShockButton.Circle) != 0;
                break;
            case DeviceType.Switch:
                this._moveInput.copyFromFloats(this._deviceSource.getInput(SwitchInput.LStickXAxis), this._deviceSource.getInput(SwitchInput.LStickYAxis));
                this._jumpInput = this._deviceSource.getInput(SwitchInput.B) != 0;
                this._dashInput = this._deviceSource.getInput(SwitchInput.R) != 0;
                this._lightAttackInput = this._deviceSource.getInput(SwitchInput.Y) != 0;
                this._heavyAttackInput = this._deviceSource.getInput(SwitchInput.X) != 0;
                this._switchGunInput = this._deviceSource.getInput(SwitchInput.A) != 0;
                break;
            case DeviceType.Touch:
                /* todo */
                break;
            case DeviceType.Xbox:
            case DeviceType.Generic:
                this._moveInput.copyFromFloats(this._deviceSource.getInput(XboxInput.LStickXAxis), this._deviceSource.getInput(XboxInput.LStickYAxis));
                this._jumpInput = this._deviceSource.getInput(XboxInput.A) != 0;
                this._dashInput = this._deviceSource.getInput(XboxInput.RB) != 0;
                this._lightAttackInput = this._deviceSource.getInput(XboxInput.X) != 0;
                this._heavyAttackInput = this._deviceSource.getInput(XboxInput.Y) != 0;
                this._switchGunInput = this._deviceSource.getInput(XboxInput.B) != 0;
                break;
        }
    }

    private _doMovement(): void {
        if (this._currentAnimation){
            this._currentAnimation.doMovement();
        }
    }

    private _doStateTransition(): void {
        if (this._moveInput.x != 0) {
            this._changeAnimationState(this._runAnimation);
        }else{
            this._changeAnimationState(this._idleAnimation);
        }
    }

    private _setupColliders(): void {

    }

    public dispose(){
        this._wallCollider.dispose();
        this._hurtboxes.forEach((hurtbox) => { hurtbox.dispose(); });
        this._hitboxes.forEach((hitbox) => { hitbox.dispose(); });
        this._spritePlayer.dispose();
    }


    private _changeAnimationState(animation: AnimationState, force: boolean = false){
        if (this._currentAnimation != animation || force){
            if (this._currentAnimation){
                this._currentAnimation.stop();
            }
            this._currentAnimation = animation;
            this._currentAnimation.start();
        }
    }

    private _getPlayerName(): string{
        return "Player_" + this._playerIndex;
    }
}


class Game {
    engine: Engine;
    gameScene: Scene;
    players: Player[];
    devices: any[];
    _maxPlayers: number = 2;

    /* camera related variables */
    mainCamera: TargetCamera;
    _cameraTarget: Vector3 = new Vector3(0, 2, 0);
    _cameraPosition: Vector3 = new Vector3(0, 2, -5);

    /* input related variables */
    deviceSourceManager: DeviceSourceManager;
    devicesConnected: number;

    /* debugging */
    _debuggingEnabled: boolean = true;

    constructor(canvas){
        this.players = [];
        this.devices = [];

        let engine = new Engine(canvas);
        this.engine = engine;
        let gameScene = new Scene(engine);
        this.deviceSourceManager = new DeviceSourceManager(engine);
        this.gameScene = gameScene;
        this.initializeCamera();

        this.deviceSourceManager.onAfterDeviceConnectedObservable.add((device) => {
            if (device.deviceType != DeviceType.Mouse) {
                this.devices.push(device);
                if (this.players.length < this._maxPlayers) {
                    this.players.push(new Player(this.gameScene, this.players.length, this.deviceSourceManager.getDeviceSource(device.deviceType, device.deviceSlot)));
                }
            }
        });

        console.log("Game created!");

        /* show the loading screen so the user knows we're doing something */
        engine.displayLoadingUI();

        if(this._debuggingEnabled){
            this.gameScene.onBeforeRenderObservable.add(() => {
                let keyboardDevice = this.deviceSourceManager.getDeviceSource(DeviceType.Keyboard);
                if (keyboardDevice){
                    /* toggle inspector on Ctrl+Alt+I */
                    if (keyboardDevice.getInput(17) && keyboardDevice.getInput(18) && keyboardDevice.getInput(73)) {
                        if (this.gameScene.debugLayer.isVisible()){
                            this.gameScene.debugLayer.hide();
                        } else {
                            this.gameScene.debugLayer.show();
                        }
                    }
                }
            });
        }

        /* setup promises to load assets asynchronously */
        let promises: Promise<any>[] = [];
        promises.push(this.initializeBackground());
        promises.push(this.loadCharacterAssets());

        /* setup game to run the game scene every render loop */
        engine.runRenderLoop(function () {
            gameScene.render();
        });

        /* if the user resizes the browser window, configure the engine to handle the resizing as well */
        window.addEventListener("resize", function () {
            engine.resize();
        });

        /* once we're done loading in all our dependencies, initialize the game then hide the loading UI */
        Promise.all(promises).then(() => {
            this.restart();
            engine.hideLoadingUI();
        });
    }

    private initializeCamera() : void {
        this.mainCamera = new FreeCamera("mainCamera", this._cameraPosition, this.gameScene);
        this.mainCamera.setTarget(this._cameraTarget);
        //this.mainCamera.attachControl(canvas);
    }

    private initializeBackground() : Promise<any> {
        this.gameScene.clearColor = new Color4(0.2, 0.2, 0.3, 1.0);
        return SceneLoader.ImportMeshAsync("","./Meshes/", "rooftop.glb", this.gameScene).then((result) => {
            result.meshes.forEach((mesh) => {
                console.log(mesh.name);
            });
        });
    }

    private loadCharacterAssets() : Promise<any> {
        Player.player1SpriteManager = new SpriteManager("Player1SpriteManager", "./Sprites/Fighter1.png", 1, {width: 32, height: 32}, this.gameScene );
        //Player.player2SpriteSheet = new SpriteManager("Player1SpriteManager", "./Sprites/Fighter2.png", 1, {width: 32, height: 32}, this.gameScene );
        return Promise.resolve();
    }

    private restart(): void {
        console.log("Restarting game!");
        this.players.forEach((player) => {
            player.dispose();
        });
        this.players = [];

        for (let i = 0; i < this.devices.length && i < this._maxPlayers; ++i){
            const device = this.devices[i];
            this.players.push(new Player(this.gameScene, i, this.deviceSourceManager.getDeviceSource(device.deviceType, device.deviceSlot)));
        }
    }
}

const canvas = document.getElementById("renderCanvas");
var game = new Game(canvas);