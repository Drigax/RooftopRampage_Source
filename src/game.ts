//import "@babylonjs/core/Debug/debugLayer";
//import "@babylonjs/inspector";
//import "@babylonjs/loaders/glTF";

import { FreeCamera, Camera, SceneLoader, SpriteManager } from "@babylonjs/core";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Vector2, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import "@babylonjs/loaders/glTF"
import { Inspector } from "@babylonjs/inspector";

class AnimationState {
    duration: number; /* how many "frames" is this animation? */
    canCancelAfter: number; /* when can the player cancel this animation into a dash animation? */
    canCancelInto: AnimationState[]; /* what valid states can this animation be cancelled for? */
    canMoveDuring: boolean; /* is the player able to use move logic while using this attack? */
}

class Attack extends AnimationState {
    hitbox: Mesh;
    startupFrames: number /* how many "frames" does it take before our hitbox becomes active? */
    activeFrames: number; /* how long is our hitbox active for? */
    recoveryFrames: number; /* how long is the player unable to do any other actions after the move deactivates? */
    hitstun: number; /* how long is the player stuck in a hit animation after being hit by this attack? */
    launchDirection: Vector2; /* where should the player be launched after being hit by this attack? */
}

class Player {
    private _scene: Scene;
    private _playerIndex: number;

    public static player1SpriteSheet: SpriteManager;
    public static player2SpriteSheet: SpriteManager;

    /* input variables */
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
    private _hitTimer: number;
    private _ammoCount: number;
    private _currentAnimation: Animation;

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

    /* constructor */
    constructor(scene: Scene, playerIndex: number){
        this._scene = scene;
        this._playerIndex = playerIndex;

        this.init();
    }

    private init() {
        this._scene.onBeforeRenderObservable.add(() => {
            this.onBeforeRender();
        });
    }

    private onBeforeRender(){
        this.updateInput();
        this.doMovement();
    }

    private updateInput(): void {

    }

    private doMovement(): void {

    }

}


class Game {
    engine: Engine;
    gameScene: Scene;
    players: Player[];
    mainCamera: Camera;

    constructor(canvas){
        let engine = new Engine(canvas);
        this.engine = engine;
        let gameScene = new Scene(engine);
        this.gameScene = gameScene;
        this.mainCamera = new FreeCamera("mainCamera", Vector3.Zero(), this.gameScene);
        this.mainCamera.attachControl(canvas);

        console.log("Game created!");

        /* show the loading screen so the user knows we're doing something */
        engine.displayLoadingUI();

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

    private initializeBackground() : Promise<any> {
        this.gameScene.clearColor = new Color4(0.2, 0.2, 0.3, 1.0);
        return SceneLoader.ImportMeshAsync("","./Meshes/", "rooftop.glb", this.gameScene).then((result) => {
            result.meshes.forEach((mesh) => {
                console.log(mesh.name);
            });
        });
    }

    private loadCharacterAssets() : Promise<any> {
        Player.player1SpriteSheet = new SpriteManager("Player1SpriteManager", "./Sprites/Fighter.png", 1, {width: 32, height: 32}, this.gameScene );
        //Player.player2SpriteSheet = new SpriteManager("Player1SpriteManager", "./Sprites/Fighter2.png", 1, {width: 32, height: 32}, this.gameScene );
        return Promise.resolve();
    }

    private restart(): void {

    }
}

const canvas = document.getElementById("renderCanvas");
const game = new Game(canvas);