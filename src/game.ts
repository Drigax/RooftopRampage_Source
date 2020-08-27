import { Sound } from "@babylonjs/core/Audio"
import { FreeCamera, TargetCamera } from "@babylonjs/core/Cameras"
import { SpriteManager } from "@babylonjs/core/Sprites"
import { Texture } from "@babylonjs/core/Materials/Textures"
import { SceneLoader } from "@babylonjs/core/Loading"
import { DeviceSourceManager, DeviceType } from "@babylonjs/core/DeviceInput";
import { InputManager } from "@babylonjs/core/Inputs/scene.inputManager"
import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Scene } from "@babylonjs/core/scene";
import "@babylonjs/loaders/glTF"
//import "@babylonjs/inspector" // uncomment to enable inspector.
import { Player, HitEvent } from "./player";
import { CpuPlayer } from "./cpuPlayer";
import { GameUI } from "./ui";
import { CubeTexture } from "@babylonjs/core/Materials/Textures/cubeTexture";

export class Game {
    canvas: HTMLCanvasElement;
    engine: Engine;
    gameScene: Scene;
    gameUI: GameUI;
    players: Player[];
    devices: any[];
    _touchDeviceConnected = false;
    _maxPlayers: number = 2;
    _currentMaxPlayers: number;
    _inputManager: InputManager;

    /* game state related variables */
    inMenu: boolean;

    /* camera related variables */
    mainCamera: TargetCamera;
    _cameraTarget: Vector3 = new Vector3(0, 2, 0);
    _cameraPosition: Vector3 = new Vector3(0, 42.5, -10);
    _cameraOffset: Vector3 = new Vector3(0, 0, 0);
    _aspectRatio: number = 1.77777776; /* 16:9 aspect ratio */
    _cameraFov: number = 62.63 * Math.PI/180;

    /* lighting */
    _environmentTexture: CubeTexture;
    _environmentTextureLevel: number = 0.5;
    _lightIntensity: number = 30;
    _backgroundColor: string = "#47a5fdff"

    /* global limits for players */
    playerMaxPosition: Vector3 = new Vector3(Infinity, Infinity, Infinity);
    playerMinPosition: Vector3 = new Vector3(-Infinity, -Infinity, -Infinity);

    /* input related variables */
    deviceSourceManager: DeviceSourceManager;
    devicesConnected: number;

    /* debugging */
    _debuggingEnabled: boolean = true;

    /* Scene Colliders */
    _groundImpostors: AbstractMesh[];
    _wallImpostors: AbstractMesh[];

    /* Spawn related Variables */
    _spawnPositions: Vector3[] = [new Vector3(0, 0, 0), new Vector3(0, 0, 0)];

    /* Hit resolution variables */
    _pendingHits: HitEvent[] = [];

    /* Music */
    _mainMenuMusic: Sound;
    _battleMusic: Sound;

    _inspectorLoaded: boolean;

    /* layering related variables */
    static DEFAULT_LAYER    = 0x0CFFFFFF;
    static HURTBOX_LAYER    = 0x10000000;
    static HITBOX_LAYER     = 0x20000000;
    static GROUND_LAYER     = 0x01000000;
    static WALL_LAYER       = 0x02000000;

    constructor(canvas){
        this.players = [];
        this.devices = [];
        this.canvas = canvas;
        this.resizeCanvas(this.canvas);
        let engine = new Engine(this.canvas);
        this.engine = engine;
        engine.displayLoadingUI();

        let gameScene = new Scene(engine);
        this.deviceSourceManager = new DeviceSourceManager(engine);
        this.gameScene = gameScene;
        this.initializeCamera();
        this.gameUI = new GameUI(this);

        this.deviceSourceManager.onAfterDeviceConnectedObservable.add((device) => {
            if (device.deviceType != DeviceType.Mouse ) {
                if (device.deviceType == DeviceType.Touch ){
                    if (!this._touchDeviceConnected){
                        this.gameUI.createTouchJoystick();
                        this._touchDeviceConnected = true;
                    } else{
                        return;
                    }
                } else {
                    if (this._touchDeviceConnected){
                        let touchDeviceIndex = this.devices.findIndex((device) => {
                            return device.deviceType == DeviceType.Touch;
                        });
                        if (touchDeviceIndex > -1){
                            this.devices[touchDeviceIndex] = device;
                            this.players[touchDeviceIndex].deviceSource = this.deviceSourceManager.getDeviceSource(device.deviceType, device.deviceSlot);
                        }
                        this.gameUI.removeTouchJoystick();
                        this.onDeviceConnected();
                        return;
                    }
                }
                this.devices.push(device);
                if (this.players.length < this._maxPlayers) {
                    this.players.push(new Player(this, this.gameScene, this.players.length, this.deviceSourceManager.getDeviceSource(device.deviceType, device.deviceSlot), false, device.deviceType == DeviceType.Touch));
                    this.onDeviceConnected();
                }
            }
        });

        console.log("Game created!");

        /* show the loading screen so the user knows we're doing something */

        this.gameScene.onBeforeRenderObservable.add(() => {
            let keyboardDevice = this.deviceSourceManager.getDeviceSource(DeviceType.Keyboard);
            if (keyboardDevice){

                /* toggle inspector on Ctrl+Alt+I */
                /* // uncomment to enable inspector.
                if (keyboardDevice.getInput(17) && keyboardDevice.getInput(18) && keyboardDevice.getInput(73)) {
                    if (this.gameScene.debugLayer.isVisible()){
                        this.gameScene.debugLayer.hide();
                    } else {
                        this.gameScene.debugLayer.show();
                        //}
                    }
                }
                */
            }
        });

        /* setup promises to load assets asynchronously */
        let promises: Promise<any>[] = [];
        promises.push(this.loadSounds());
        promises.push(this.initializeBackground());
        promises.push(this.loadCharacterAssets());

        gameScene.onBeforeRenderObservable.add(() =>{
            this._resolveHitEvents(); /* we do this before the players' next update in order to eliminate port priority for hit resolution. */
        })

        /* setup game to run the game scene every render loop */
        engine.runRenderLoop(function () {
            gameScene.render();
        });

        /* if the user resizes the browser window, configure the engine to handle the resizing as well */
        window.addEventListener("resize", () => {
            //this.resizeCanvas(this.canvas);
            this.engine.resize();
        });

        /* once we're done loading in all our dependencies, initialize the game then hide the loading UI */
        Promise.all(promises).then(() => {
            this.inMenu = true;
            this.gameUI.showStartMenu();
            this.gameUI.updatePlayerDevices(this.inMenu);

            let enterFullscreen = function(event) {
                engine.enterFullscreen(false);
                console.log('entering fullscreen!');
            }
            /* setup fullscreen game */
            canvas.addEventListener('dblclick', enterFullscreen);
            let isMobile = false;
            /* mobile check */
            if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
                canvas.addEventListener('click', enterFullscreen);
                try{
                    canvas.click = enterFullscreen; /* possible workaround for webkit */
                } finally {

                }
            }

            setInterval(() => {
                engine.hideLoadingUI();
            }, 500);
        });
    }

    private onDeviceConnected() : void {
        this.gameUI.updatePlayerDevices(this.inMenu);
    }

    private resizeCanvas(canvas) : void {
        let winWidth = window.innerWidth;
        let winHeight = window.innerHeight;

        let aspectRatio = this._aspectRatio;
        let heightTimesAspect = Math.round(winHeight * aspectRatio);

        if (winWidth <= heightTimesAspect) {
            canvas.width = winWidth;
            canvas.height = Math.round(winWidth / aspectRatio);
        } else {
            canvas.width = heightTimesAspect;
            canvas.height = winHeight;
        }
    }

    private initializeCamera() : void {
        this.mainCamera = new FreeCamera("mainCamera", this._cameraPosition, this.gameScene);
        this.mainCamera.fov = this._cameraFov;
        this.updateCamera();
    }

    private updateCamera() : void {
        this.mainCamera.position = this._cameraPosition;
        this.mainCamera.setTarget(this._cameraTarget);
    }

    private loadSounds() : Promise<any> {
        return Promise.resolve().then(() => {
            this._mainMenuMusic = new Sound("KMelzi-StreetFighter", "./Sounds/KMelzi-StreetFighter.mp3", this.gameScene, null, {autoplay: true, loop: true, volume:0.7});
            this._battleMusic = new Sound("NatsuFuji-HIDDEN", "./Sounds/NatsuFuji-HIDDEN.mp3", this.gameScene, null, {autoplay: false, loop: true, volume:0.7});
            return Player.loadSounds(this.gameScene).then(() => {
                return Promise.resolve();
            });
        });
    }

    private initializeBackground() : Promise<any> {
        this._groundImpostors = [];
        this._wallImpostors = [];
        return SceneLoader.ImportMeshAsync("","./Meshes/", "rooftop.glb", this.gameScene).then((result) => {
            this.gameScene.getNodes().forEach((mesh) => {
                if (mesh.name == "GroundImpostor") {
                    this._groundImpostors.push(mesh as AbstractMesh);
                    this.playerMinPosition.copyFromFloats(this.playerMinPosition.x, (mesh as AbstractMesh).absolutePosition.y, this.playerMinPosition.z);
                } else if (mesh.name == "WallImpostor_L") {
                    this._wallImpostors.push(mesh as AbstractMesh);
                    this.playerMinPosition.copyFromFloats((mesh as AbstractMesh).absolutePosition.x, this.playerMinPosition.y, this.playerMinPosition.z);
                } else if (mesh.name == "WallImpostor_R") {
                    this._wallImpostors.push(mesh as AbstractMesh);
                    this.playerMaxPosition.copyFromFloats((mesh as AbstractMesh).absolutePosition.x, this.playerMaxPosition.y, this.playerMaxPosition.z);
                } else if (mesh.name == "Camera") {
                    mesh.getWorldMatrix().decompose(null, null, this._cameraPosition);
                    this._cameraPosition.addInPlace(this._cameraOffset);
                } else if (mesh.name == "CameraTarget" ) {
                    mesh.getWorldMatrix().decompose(null, null, this._cameraTarget);
                } else if (mesh.name == "Player1_Spawn") {
                    mesh.getWorldMatrix().decompose(null, null, this._spawnPositions[0]);
                } else if (mesh.name == "Player2_Spawn") {
                    mesh.getWorldMatrix().decompose(null, null, this._spawnPositions[1]);
                } else {
                    if (mesh instanceof AbstractMesh) {
                        mesh.layerMask = Game.DEFAULT_LAYER;
                    }
                }
            });
            this.gameScene.lights.forEach((light) => {
                light.intensity /= 10; /* Currently, blender exported intensity is 10x expected value. Possible bug? */
            });
            this._environmentTexture = new CubeTexture("./Hdr/canary_wharf_1k.env", this.gameScene);
            this._environmentTexture.level = this._environmentTextureLevel;
            this.gameScene.environmentTexture = this._environmentTexture;
            this.gameScene.clearColor = Color4.FromHexString(this._backgroundColor);

            this.updateCamera();

            this._groundImpostors.forEach((mesh) => {
                mesh.layerMask = Game.GROUND_LAYER;
                mesh.isVisible = false;
            });

            this._wallImpostors.forEach((mesh) => {
                mesh.layerMask = Game.WALL_LAYER;
                mesh.isVisible = false;
            });
        });
    }

    private loadCharacterAssets() : Promise<any> {
        Player.player1SpriteManager = new SpriteManager("Player1SpriteManager", "./Sprites/Fighter1.png", 1, {width: 32, height: 32}, this.gameScene, 0.01, Texture.NEAREST_SAMPLINGMODE );
        Player.player2SpriteManager = new SpriteManager("Player2SpriteManager", "./Sprites/Fighter2.png", 1, {width: 32, height: 32}, this.gameScene, 0.01, Texture.NEAREST_SAMPLINGMODE );
        return Promise.resolve();
    }

    private restart(): void {
        console.log("Restarting game!");
        this.players.forEach((player) => {
            player.dispose();
        });
        this.players = [];

        for (let i = 0; i < this.devices.length && i < this._currentMaxPlayers; ++i){
            const device = this.devices[i];
            let player = new Player(this, this.gameScene, i, this.deviceSourceManager.getDeviceSource(device.deviceType, device.deviceSlot), true, device.deviceType == DeviceType.Touch);

            this.players.push(player);

        }
        for (let i = this.players.length; i < this._maxPlayers; ++i){
            let cpuPlayer = new CpuPlayer(this, this.gameScene, i, null, true);
            this.players.push(cpuPlayer);
        }

        this.players.forEach((player) => {
            player.onHealthChanged.add((health) => {
                this.gameUI.setPlayerHealthPercent(player.getIndex(), player.getHealth()/player.getMaxHealth())
            });
        });
    }

    public startOnePlayer(): void{
        /* temporarily remove player 2 if connected. */
        this._currentMaxPlayers = 1;
        /* instantiate CPU player as player 2 */
        this.startBattle();
    }

    public startTwoPlayer(): void{
        this._currentMaxPlayers = 2;
        this.startBattle();
    }

    private startBattle(): void{
        this.restart();
        this.inMenu = false;
        this._mainMenuMusic.stop();
        this._mainMenuMusic.autoplay = false;
        this.gameUI.showBattleUi();
        this._battleMusic.autoplay = true;
        this._battleMusic.play();
    }

    private endBattle(): void {
        /* undo whatever temporary removal of player 2 we did */
        this.inMenu = true;
        this._battleMusic.stop();
        this._battleMusic.autoplay = false;
        this.gameUI.showMainMenu();
        this._mainMenuMusic.autoplay = true;
        this._mainMenuMusic.play();
    }

    public reportHit(hit: HitEvent){
        this._pendingHits.push(hit);
    }

    private _resolveHitEvents(){
        let currentHit: HitEvent;
        while(this._pendingHits.length > 0){
            currentHit = this._pendingHits.shift();
            currentHit.hurtPlayer.applyHit(currentHit);
        }
    }

    public getSpawnPosition(playerIndex: number){
        return this._spawnPositions[playerIndex % this._spawnPositions.length];
    }
}

const canvas = document.getElementById("renderCanvas");
var game = new Game(canvas);