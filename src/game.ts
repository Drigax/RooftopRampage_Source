import { FreeCamera, TargetCamera, SceneLoader, SpriteManager, Sprite, DeviceSourceManager, DeviceSource, DeviceType, DualShockInput, DualShockButton, SwitchInput, XboxInput, GenericController } from "@babylonjs/core";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Ray } from "@babylonjs/core/Culling"
import { Engine } from "@babylonjs/core/Engines/engine";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector2, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { IDisposable, Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight"
import "@babylonjs/loaders/glTF"
import "@babylonjs/inspector";

class AnimationStateBase {
    player: Player;
    spritePlayer: Sprite;
    from: number; /* what "frame" on our spritesheet does this start at? */
    to: number; /* what "frame" on our spritesheet does this end at? */
    speed: number; /* how long in ms is each frame of this animation? */
    reverse: boolean; /* should we play this animation in reverse? */
    loop: boolean; /* should this animation loop? */
    onAnimationEnd: () => void = () => {}; /* do we want to define a callback for this animation finishing? */
    canCancelAfter: number; /* when can the player cancel this animation into a dash animation? */
    update () {};
    start () {};
    stop () {};
    doesMovement: boolean;
    doMovement() {};
    public playAnimation () {
        if (this.reverse) {
            this.spritePlayer.playAnimation(this.to, this.from, this.loop, this.speed, this.onAnimationEnd);
        } else {
            this.spritePlayer.playAnimation(this.from, this.to, this.loop, this.speed, this.onAnimationEnd);
        }
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
    private _deltaTime: number; /* The time since the last frame, in seconds */

    public static player1SpriteManager: SpriteManager;
    public static player2SpriteManager: SpriteManager;

    private _transform: TransformNode;
    private _spritePlayerTransform: TransformNode;
    private _spritePlayerOffset: Vector3 = new Vector3(0, 0.5, 0);

    /* input variables */
    private _deviceSource: DeviceSource<any>;
    private _moveInput: Vector3 = new Vector3();
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
    private _gunDrawn: boolean = false;

    /* physics related variables */
    private _gravity: Vector3 = new Vector3(0, -3, 0);
    private _groundRaycastDirection: Vector3 = new Vector3(0, -1, 0);
    private _groundRaycastOffset: Vector3 =  new Vector3(0, 0.2, 0);
    private _groundRaycastLength: number = 0.2;
    private _wallRaycastDirections: Vector3[] = [new Vector3(-1, 0, 0), new Vector3(1, 0, 0)];
    private _knockbackDirection: Vector3 = new Vector3();
    private _wallCollider: Mesh;
    private _hurtboxes: Mesh[];
    private _hitboxes: Mesh[];

    /* movement related variables */
    private _velocity: Vector3 = new Vector3(); /* Current world-space velocity */
    private _moveSpeed: number = 3;
    private _jumpSpeed: number = 3;
    private _jumpTimer: number = 0.4;
    private _jumpTimerElapsed: number = 0;
    private _dashSpeed: number = 8;
    private _dashTimer: number = 0.25;
    private _dashTimerElapsed: number = 0;
    private _dashCooldownTimer: number = 0.5;
    private _dashCooldownTimerElapsed: number = 0;
    private _dashDirection: number = 1;

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
    private _switchGunAnimation: AnimationState = new AnimationState();
    private _switchGunReverseAnimation: AnimationState = new AnimationState();

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
        this._transform.rotate(Vector3.Up(), 2*Math.PI); /* manually rotate the player so we use TransformNode.rotationQuaternion instead of TranformNode.rotation */
        this._setupColliders()
        promises.push(this._setupAnimations());
        return Promise.all(promises).then(() => {
            this.reset();
            return Promise.resolve();
        });
    }

    public reset(startPosition: Vector3 = Vector3.Zero()) {
        this._changeAnimationState(this._idleAnimation);
        this._gunDrawn = false;
        this._transform.position.copyFrom(startPosition);
        /* this._ammo = this._maxAmmo */
        /* this._health = this._maxHealth;*/
    }

    /* Animations */
    private _setupAnimations(): Promise<any>{
        this._setupSpritePlayer();

        /* NOTE: The animation frame data can be defined and loaded from JSON, or some other
                 source if you want to support extensible animations, but for the
                 sake of implementation complexity, I decided to statically define
                 the animation and state logic. */

        /* idle frame data and state logic */
        this._idleAnimation.player = this;
        this._idleAnimation.spritePlayer = this._spritePlayer;
        this._idleAnimation.from = 0;
        this._idleAnimation.to = 17;
        this._idleAnimation.speed = 100;
        this._idleAnimation.canCancelAfter = 0;
        this._idleAnimation.loop = true;
        this._idleAnimation.start = function () {
            this.playAnimation();
            this.player._canMove = true;
            this.player._canJump = true;
            this.player._canBeHit = true;
            this.player._canWallRun = false;
            console.log("entering idle state");
        };
        this._idleAnimation.stop = function () {
            console.log("leaving idle state");
        }

        /* idle (with gun drawn) frame data and state logic */
        this._idleGunAnimation.player = this;
        this._idleGunAnimation.spritePlayer = this._spritePlayer;
        this._idleGunAnimation.from = 88;
        this._idleGunAnimation.to = 105;
        this._idleGunAnimation.speed = 100;
        this._idleGunAnimation.canCancelAfter = 0;
        this._idleGunAnimation.loop = true;
        this._idleGunAnimation.start = function () {
            this.playAnimation();
            this.player._canMove = true;
            this.player._canJump = true;
            this.player._canBeHit = true;
            this.player._canWallRun = false;
            console.log("entering idle-gun state");
        };
        this._idleGunAnimation.stop = function () {
            console.log("leaving idle-gun state");
        }

        /* switch from hand-to-hand to gun-drawn player states */
        this._switchGunAnimation.player = this;
        this._switchGunAnimation.spritePlayer = this._spritePlayer;
        this._switchGunAnimation.from = 158;
        this._switchGunAnimation.to = 164;
        this._switchGunAnimation.speed = 100;
        this._switchGunAnimation.canCancelAfter = 0;
        this._switchGunAnimation.loop = false;
        this._switchGunAnimation.start = function () {
            this.playAnimation();
            this.player._canMove = false;
            this.player._canJump = false;
            this.player._canBeHit = true;
            this.player._canWallRun = false;
            console.log("entering switch-gun state");
        };
        this._switchGunAnimation.doesMovement = true;
        this._switchGunAnimation.doMovement = () => {
            this._velocity.copyFromFloats(0, 0, 0);
        }
        this._switchGunAnimation.onAnimationEnd = () => {
            this._gunDrawn = !this._gunDrawn;
            this._changeAnimationState(this._idleGunAnimation);
        }
        this._switchGunAnimation.stop = function () {
            console.log("leaving switch-gun state");
        }

        /* switch from gun-drawn to hand-to-hand  player states */
        this._switchGunReverseAnimation.player = this;
        this._switchGunReverseAnimation.spritePlayer = this._spritePlayer;
        this._switchGunReverseAnimation.from = 158;
        this._switchGunReverseAnimation.to = 164;
        this._switchGunReverseAnimation.speed = 100;
        this._switchGunReverseAnimation.canCancelAfter = 0;
        this._switchGunReverseAnimation.reverse = true;
        this._switchGunReverseAnimation.loop = false;
        this._switchGunReverseAnimation.start = function () {
            this.playAnimation();
            this.player._canMove = false;
            this.player._canJump = false;
            this.player._canBeHit = true;
            this.player._canWallRun = false;
            console.log("entering switch-gun state");
        };
        this._switchGunReverseAnimation.doesMovement = true;
        this._switchGunReverseAnimation.doMovement = () => {
            this._velocity.copyFromFloats(0, 0, 0);
        }
        this._switchGunReverseAnimation.onAnimationEnd = () => {
            this._gunDrawn = !this._gunDrawn;
            this._changeAnimationState(this._idleAnimation);
        }
        this._switchGunReverseAnimation.stop = function () {
            console.log("leaving switch-gun state");
        }

        /* running animation frame data and state logic */
        this._runAnimation.player = this;
        this._runAnimation.spritePlayer = this._spritePlayer;
        this._runAnimation.from = 18;
        this._runAnimation.to = 27;
        this._runAnimation.speed = 100;
        this._runAnimation.canCancelAfter = 0;
        this._runAnimation.loop = true;
        this._runAnimation.start = function () {
            this.playAnimation();
            this.player._canMove = true;
            this.player._canJump = true;
            this.player._canBeHit = true;
            this.player._canWallRun = false;
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

        /* running (with gun drawn) animation frame data and state logic */
        this._runGunAnimation.player = this;
        this._runGunAnimation.spritePlayer = this._spritePlayer;
        this._runGunAnimation.from = 106;
        this._runGunAnimation.to = 115;
        this._runGunAnimation.speed = 100;
        this._runGunAnimation.canCancelAfter = 0;
        this._runGunAnimation.loop = true;
        this._runGunAnimation.start = function () {
            this.playAnimation();
            this.player._canMove = true;
            this.player._canJump = true;
            this.player._canBeHit = true;
            this.player._canWallRun = false;
            console.log("entering run-gun state");
        };
        this._runGunAnimation.update = () => {
            if (this._moveInput.x > 0 && this._flipped ||
                this._moveInput.x < 0 && !this._flipped ) {
                    this._flip();
            }
        }
        this._runGunAnimation.stop = function () {
            console.log("leaving run-gun state");
        }

        /* Jump animation frame data and state logic */
        this._jumpAnimation.player = this;
        this._jumpAnimation.spritePlayer = this._spritePlayer;
        this._jumpAnimation.from = 28;
        this._jumpAnimation.to = 36;
        this._jumpAnimation.speed = 100;
        this._jumpAnimation.canCancelAfter = 0;
        this._jumpAnimation.loop = false;
        this._jumpAnimation.start = function () {
            this.playAnimation();
            this.player._canMove = true;
            this.player._canJump = false;
            this.player._canBeHit = true;
            this.player._canWallRun = true;
            this.player._jumpTimerElapsed = this.player._jumpTimer;
            console.log("entering jump state");
        };
        this._jumpAnimation.update = () => {
            if (true){
                console.log("engine.getDeltaTime():" + this._deltaTime);
                console.log ("_jumpTimerElapsed : " + this._jumpTimerElapsed);
            }
            this._jumpTimerElapsed -= this._deltaTime;
        }
        this._jumpAnimation.stop = function () {
            console.log("leaving jump state");
        }

        /* Jump animation (with gun drawn) frame data and state logic */
        this._jumpGunAnimation.player = this;
        this._jumpGunAnimation.spritePlayer = this._spritePlayer;
        this._jumpGunAnimation.from = 116;
        this._jumpGunAnimation.to = 124;
        this._jumpGunAnimation.speed = 100;
        this._jumpGunAnimation.canCancelAfter = 0;
        this._jumpGunAnimation.loop = false;
        this._jumpGunAnimation.start = function () {
            this.playAnimation();
            this.player._canMove = true;
            this.player._canJump = false;
            this.player._canBeHit = true;
            this.player._canWallRun = true;
            this.player._jumpTimerElapsed = this.player._jumpTimer;
            console.log("entering jump-gun state");
        };
        this._jumpGunAnimation.update = () => {
            this._jumpTimerElapsed -= this._deltaTime;
        }
        this._jumpGunAnimation.stop = function () {
            console.log("leaving jump-gun state");
        }

        /* Fall animation frame data and state logic */
        this._fallAnimation.player = this;
        this._fallAnimation.spritePlayer = this._spritePlayer;
        this._fallAnimation.from = 36;
        this._fallAnimation.to = 48;
        this._fallAnimation.speed = 100;
        this._fallAnimation.canCancelAfter = 0;
        this._fallAnimation.loop = false;
        this._fallAnimation.start = function () {
            this.playAnimation();
            this.player._canMove = true;
            this.player._canJump = false;
            this.player._canBeHit = true;
            this.player._canWallRun = true;
            console.log("entering fall state");
        };
        this._fallAnimation.stop = function () {
            console.log("leaving fall state");
        }


        /* Fall animation (with gun drawn) frame data and state logic */
        this._fallGunAnimation.player = this;
        this._fallGunAnimation.spritePlayer = this._spritePlayer;
        this._fallGunAnimation.from = 124;
        this._fallGunAnimation.to = 136;
        this._fallGunAnimation.speed = 100;
        this._fallGunAnimation.canCancelAfter = 0;
        this._fallGunAnimation.loop = false;
        this._fallGunAnimation.start = function () {
            this.playAnimation();
            this.player._canMove = true;
            this.player._canJump = false;
            this.player._canBeHit = true;
            this.player._canWallRun = true;
            console.log("entering fall-gun state");
        };
        this._fallGunAnimation.stop = function () {
            console.log("leaving fall-gun state");
        }

        /* dash animation frame data and state logic */
        this._dashAnimation.player = this;
        this._dashAnimation.spritePlayer = this._spritePlayer;
        this._dashAnimation.from = 55;
        this._dashAnimation.to = 61;
        this._dashAnimation.speed = 50;
        this._dashAnimation.canCancelAfter = 0;
        this._dashAnimation.loop = false;
        this._dashAnimation.start = function () {
            this.playAnimation();
            this.player._canMove = false;
            this.player._canJump = true;
            this.player._canBeHit = false;
            this.player._canWallRun = false;
            this.player._jumpTimerElapsed = 0;
            if (this.player._flipped){
                if (this.player._moveInput.x <= 0){
                    this.player._dashDirection = -1;
                }else{
                    this.player._dashDirection = 1;
                }
            } else {
                if (this.player._moveInput.x >= 0){
                    this.player._dashDirection = 1;
                } else {
                    this.player._dashDirection = -1;
                }
            }
            this.player._dashTimerElapsed = this.player._dashTimer;
            console.log("entering dash state");
        }
        this._dashAnimation.update = () => {
            this._dashTimerElapsed -= this._deltaTime;
            console.log("player._dashTimer: " + this._dashTimerElapsed);
            if (this._dashTimerElapsed <= 0){
                if (this._grounded){
                    this._changeAnimationState(this._idleAnimation);
                } else {
                    this._changeAnimationState(this._fallAnimation);
                }
            }
        }
        this._dashAnimation.doesMovement = true;
        this._dashAnimation.doMovement = () => {
            this._velocity.copyFromFloats(1, 0, 0);
            this._velocity.scaleInPlace(this._dashDirection * this._dashSpeed);
            this._transform.position.addInPlace(this._velocity.scale(this._deltaTime));
        }
        this._dashAnimation.stop = () => {
            console.log("exiting dash state");
            this._dashCooldownTimerElapsed = this._dashCooldownTimer;
        }

        /* dash animation (with gun drawn) frame data and state logic */
        this._dashGunAnimation.player = this;
        this._dashGunAnimation.spritePlayer = this._spritePlayer;
        this._dashGunAnimation.from = 142;
        this._dashGunAnimation.to = 148;
        this._dashGunAnimation.speed = 50;
        this._dashGunAnimation.canCancelAfter = 0;
        this._dashGunAnimation.loop = false;
        this._dashGunAnimation.start = function () {
            this.playAnimation();
            this.player._canMove = false;
            this.player._canJump = true;
            this.player._canBeHit = false;
            this.player._canWallRun = false;
            this.player._jumpTimerElapsed = 0;
            if (this.player._flipped){
                if (this.player._moveInput.x <= 0){
                    this.player._dashDirection = -1;
                }else{
                    this.player._dashDirection = 1;
                }
            } else {
                if (this.player._moveInput.x >= 0){
                    this.player._dashDirection = 1;
                } else {
                    this.player._dashDirection = -1;
                }
            }
            this.player._dashTimerElapsed = this.player._dashTimer;
            console.log("entering dash-gun state");
        }
        this._dashGunAnimation.update = () => {
            this._dashTimerElapsed -= this._deltaTime;
            if (this._dashTimerElapsed <= 0){
                if (this._grounded){
                    this._changeAnimationState(this._idleGunAnimation);
                } else {
                    this._changeAnimationState(this._fallGunAnimation);
                }
            }
        }
        this._dashGunAnimation.doesMovement = true;
        this._dashGunAnimation.doMovement = () => {
            this._velocity.copyFromFloats(1, 0, 0);
            this._velocity.scaleInPlace(this._dashDirection * this._dashSpeed);
            this._transform.position.addInPlace(this._velocity.scale(this._deltaTime));
        }
        this._dashGunAnimation.stop = () => {
            console.log("exiting dash-gun state");
            this._dashCooldownTimerElapsed = this._dashCooldownTimer;
        }

        /* */
        //_hitAnimation: AnimationState = new AnimationState();
        //_hitGunAnimation: AnimationState = new AnimationState();

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
        this._deltaTime = this._scene.getEngine().getDeltaTime()/1000;
        this._updateInput();
        this._checkColliders();
        this._updateTimers();
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
                this._moveInput.copyFromFloats(this._deviceSource.getInput(68) - this._deviceSource.getInput(65), /* D = X+, A = X- */
                                               this._deviceSource.getInput(87) - this._deviceSource.getInput(83), /* W = Y+, S = Y- */
                                               0);
                this._jumpInput = this._deviceSource.getInput(32) != null ? this._deviceSource.getInput(32) != 0 : false;         /* jump = space */
                this._dashInput = this._deviceSource.getInput(16) != null ? this._deviceSource.getInput(16) != 0 : false;         /* dash = shift */
                this._lightAttackInput = this._deviceSource.getInput(74) != null ? this._deviceSource.getInput(74) != 0 : false;  /* light attack = J */
                this._heavyAttackInput = this._deviceSource.getInput(75) != null ? this._deviceSource.getInput(75) != 0 : false;  /* heavy attack = K */
                this._switchGunInput = this._deviceSource.getInput(76) != null ? this._deviceSource.getInput(76) != 0 : false;    /* switch to gun = L */

                if (false){
                    console.log("_moveInput: " + this._moveInput + "\r\n"
                            + "_jumpInput: " + this._jumpInput + "\r\n"
                            + "_dashInput: " + this._dashInput + "\r\n"
                            + "_lightAttackInput: " + this._lightAttackInput + "\r\n"
                            + "_heavyAttackInput: " + this._heavyAttackInput + "\r\n"
                            + "_switchGunInput: " + this._switchGunInput);
                }
                if (false) {
                    console.log("_moveRawInput: " + [this._deviceSource.getInput(68) - this._deviceSource.getInput(65), this._deviceSource.getInput(87) - this._deviceSource.getInput(83)] + "\r\n"
                            + "_jumpInput: " + this._deviceSource.getInput(32) + "\r\n"
                            + "_dashInput: " + this._deviceSource.getInput(16) + "\r\n"
                            + "_lightAttackInput: " + this._deviceSource.getInput(74) + "\r\n"
                            + "_heavyAttackInput: " + this._deviceSource.getInput(75) + "\r\n"
                            + "_switchGunInput: " + this._deviceSource.getInput(76));
                }
                break;
            case DeviceType.DualShock:
                this._moveInput.copyFromFloats(this._deviceSource.getInput(DualShockInput.LStickXAxis), this._deviceSource.getInput(DualShockInput.LStickYAxis), 0);
                this._jumpInput = this._deviceSource.getInput(DualShockButton.Cross) != 0;
                this._dashInput = this._deviceSource.getInput(DualShockButton.R1) != 0;
                this._lightAttackInput = this._deviceSource.getInput(DualShockButton.Square) != 0;
                this._heavyAttackInput = this._deviceSource.getInput(DualShockButton.Triangle) != 0;
                this._switchGunInput = this._deviceSource.getInput(DualShockButton.Circle) != 0;
                break;
            case DeviceType.Switch:
                this._moveInput.copyFromFloats(this._deviceSource.getInput(SwitchInput.LStickXAxis), this._deviceSource.getInput(SwitchInput.LStickYAxis), 0);
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
                this._moveInput.copyFromFloats(this._deviceSource.getInput(XboxInput.LStickXAxis), this._deviceSource.getInput(XboxInput.LStickYAxis), 0);
                this._jumpInput = this._deviceSource.getInput(XboxInput.A) != 0;
                this._dashInput = this._deviceSource.getInput(XboxInput.RB) != 0;
                this._lightAttackInput = this._deviceSource.getInput(XboxInput.X) != 0;
                this._heavyAttackInput = this._deviceSource.getInput(XboxInput.Y) != 0;
                this._switchGunInput = this._deviceSource.getInput(XboxInput.B) != 0;
                break;
        }
    }

    private _checkColliders(): void {
        /* check for ground */
        let ray = new Ray(this._transform.position.add(this._groundRaycastOffset), this._groundRaycastDirection, this._groundRaycastLength);
        let pickableMeshes = (mesh: Mesh) => {
            return mesh.isPickable && mesh.layerMask & Game.GROUND_LAYER && mesh.isEnabled();
        }
        let rayPick = this._scene.pickWithRay(ray, pickableMeshes);
        this._grounded = rayPick.hit;

        /* check for walls */
        /* check for hits */
    }

    private _doMovement(): void {
        if (this._currentAnimation && this._currentAnimation.doesMovement){
            this._currentAnimation.doMovement();
        } else {
            if (this._canMove) {
                /* set the movement vector using the player locomotion */
                this._velocity.copyFromFloats(0, 0, 0);
                if (!this._grounded && this._jumpTimerElapsed <= 0){
                    this.doGravityMovement(this._velocity);
                }
                this.doHorizontalMovement(this._velocity);
                if (this._jumpTimerElapsed > 0) {
                    this.doJumpMovement(this._velocity);
                }
            }
            this._transform.position.addInPlace( this._velocity.scale(this._deltaTime));
        }
    }

    public doGravityMovement(moveVector: Vector3): void {
        moveVector.addInPlace(this._gravity);
    }

    private doHorizontalMovement(moveVector: Vector3): void {
        let moveSpeed: Vector3 = this._moveInput.scale(this._moveSpeed);
        moveVector.addInPlace(moveSpeed);
    }

    public doJumpMovement(moveVector: Vector3): void {
        moveVector.addInPlace(new Vector3(0, this._jumpSpeed));
    }

    public doDashMovement(moveVector: Vector3): void {
        moveVector.addInPlace(new Vector3(this._dashSpeed, 0, 0));
    }

    private _updateTimers() {
        if (this._dashCooldownTimerElapsed > 0){
            this._dashCooldownTimerElapsed -= this._deltaTime;
        }
        if (this._hitTimer > 0){
            this._hitTimer -= this._deltaTime;
        }
    }

    private _doStateTransition(): void {
        if (this._hitTimer > 0) {
            if (this._gunDrawn) {
                this._changeAnimationState(this._hitGunAnimation);
            } else {
                this._changeAnimationState(this._hitAnimation)
            }
            return;
        }
        if (this._canMove) {
            if (this._switchGunInput) {
                if (this._gunDrawn) {
                    this._changeAnimationState(this._switchGunReverseAnimation);
                 } else {
                    this._changeAnimationState(this._switchGunAnimation);
                 }
            } else if ((this._dashCooldownTimerElapsed <= 0 && this._dashInput) || this._dashTimerElapsed > 0) {
                if (this._gunDrawn) {
                    this._changeAnimationState(this._dashGunAnimation);
                } else {
                    this._changeAnimationState(this._dashAnimation);
                }
            } else if ((this._canJump && this._jumpInput) || this._jumpTimerElapsed > 0) {
                if (this._gunDrawn) {
                    this._changeAnimationState(this._jumpGunAnimation);
                } else {
                    this._changeAnimationState(this._jumpAnimation);
                }
            } else if (this._lightAttackInput) {
                this._changeAnimationState(this._light1Attack);
            } else if (this._grounded && this._heavyAttackInput) {
                this._changeAnimationState(this._heavy1Attack);
            } else if (!this._grounded) {
                if (this._gunDrawn) {
                    this._changeAnimationState(this._fallGunAnimation);
                } else {
                    this._changeAnimationState(this._fallAnimation);
                }
            } else if (this._moveInput.x != 0) {
                if (this._gunDrawn){
                    this._changeAnimationState(this._runGunAnimation);
                } else {
                    this._changeAnimationState(this._runAnimation);
                }
            }else {
                if (this._gunDrawn) {
                    this._changeAnimationState(this._idleGunAnimation);
                } else {
                    this._changeAnimationState(this._idleAnimation);
                }
            }
        }
    }

    private _setupColliders(): void {
        this._hurtboxes = [];
        this._hitboxes = [];
        let hurtbox = MeshBuilder.CreateBox(this._getPlayerName()+"_hurtbox", {
            width: 0.5, height: 1, depth: 0.5
        }, this._scene);
        hurtbox.layerMask = Game.HURTBOX_LAYER;
        this._hurtboxes.push(hurtbox);

        /* offset the player collider such that the transform origin is at the collider's bottom */
        hurtbox.position = new Vector3(0, 0.5, 0);
        hurtbox.bakeCurrentTransformIntoVertices();
        hurtbox.setParent(this._transform);
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

    /* layering related variables */
    static DEFAULT_LAYER    = 0x0FFFFFFF;
    static HURTBOX_LAYER    = 0x10000000;
    static HITBOX_LAYER     = 0x20000000;
    static GROUND_LAYER     = 0x01000000;

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
            let environmentLight = new HemisphericLight("sunLight", Vector3.Up(), this.gameScene);
            /* dim the light a bit */
            environmentLight.intensity = 0.7;
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