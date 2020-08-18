import { FreeCamera, TargetCamera } from "@babylonjs/core/Cameras"
import { SpriteManager } from "@babylonjs/core/Sprites"
import { SceneLoader } from "@babylonjs/core/Loading"
import { DeviceSourceManager, DeviceType } from "@babylonjs/core/DeviceInput";
import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Scene } from "@babylonjs/core/scene";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight"
import "@babylonjs/loaders/glTF"
import "@babylonjs/inspector";
import { Player, HitEvent } from "./player";

export class Game {
    canvas: HTMLCanvasElement;
    engine: Engine;
    gameScene: Scene;
    players: Player[];
    devices: any[];
    _maxPlayers: number = 2;

    /* camera related variables */
    mainCamera: TargetCamera;
    _cameraTarget: Vector3 = new Vector3(0, 2, 0);
    _cameraPosition: Vector3 = new Vector3(0, 3, -10);
    _cameraOffset: Vector3 = new Vector3(0, 0, -2.5);
    _aspectRatio: number = 1.77777776; /* 16:9 aspect ratio */

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
        this.resizeCanvas(this.canvas)
        let engine = new Engine(this.canvas);
        this.engine = engine;
        let gameScene = new Scene(engine);
        this.deviceSourceManager = new DeviceSourceManager(engine);
        this.gameScene = gameScene;
        this.initializeCamera();

        this.deviceSourceManager.onAfterDeviceConnectedObservable.add((device) => {
            if (device.deviceType != DeviceType.Mouse) {
                this.devices.push(device);
                if (this.players.length < this._maxPlayers) {
                    this.players.push(new Player(this, this.gameScene, this.players.length, this.deviceSourceManager.getDeviceSource(device.deviceType, device.deviceSlot)));
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
        MeshBuilder.CreateBox("helper", {size: 0.1}, gameScene);

        /* setup promises to load assets asynchronously */
        let promises: Promise<any>[] = [];
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
            this.restart();
            engine.hideLoadingUI();
        });
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
        this.updateCamera();
    }

    private updateCamera() : void {
        this.mainCamera.position = this._cameraPosition;
        this.mainCamera.setTarget(this._cameraTarget);
    }

    private initializeBackground() : Promise<any> {
        this._groundImpostors = [];
        this._wallImpostors = [];
        this.gameScene.clearColor = new Color4(0.2, 0.2, 0.3, 1.0);
        return SceneLoader.ImportMeshAsync("","./Meshes/", "rooftop.glb", this.gameScene).then((result) => {
            let environmentLight = new HemisphericLight("sunLight", Vector3.Up(), this.gameScene);
            /* dim the light a bit */
            environmentLight.intensity = 0.7;
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
                console.log(mesh.name);
            });

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
        Player.player1SpriteManager = new SpriteManager("Player1SpriteManager", "./Sprites/Fighter1.png", 1, {width: 32, height: 32}, this.gameScene );
        Player.player2SpriteManager = new SpriteManager("Player2SpriteManager", "./Sprites/Fighter2.png", 1, {width: 32, height: 32}, this.gameScene );
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
            this.players.push(new Player(this, this.gameScene, i, this.deviceSourceManager.getDeviceSource(device.deviceType, device.deviceSlot)));
        }
    }

    public reportHit(hit: HitEvent){
        this._pendingHits.push(hit);
    }

    private _resolveHitEvents(){
        let currentHit: HitEvent;
        while(this._pendingHits.length > 0){
            currentHit = this._pendingHits.shift();
            currentHit.hurtPlayer.onHit(currentHit);
        }
    }

    public getSpawnPosition(playerIndex: number){
        return this._spawnPositions[playerIndex % this._spawnPositions.length];
    }
}

const canvas = document.getElementById("renderCanvas");
var game = new Game(canvas);