import { IDisposable, Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths";
import { TransformNode, Mesh, MeshBuilder } from "@babylonjs/core/Meshes";
import { Sprite, SpriteManager } from "@babylonjs/core/Sprites"
import { Ray } from "@babylonjs/core/Culling"
import { RayHelper } from "@babylonjs/core/Debug"
import { DeviceSource, DeviceType, DualShockInput, SwitchInput, XboxInput} from "@babylonjs/core/DeviceInput";
import { DualShockButton } from "@babylonjs/core/Gamepads/dualShockGamepad";
import { Game } from "./game"

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
    startupFrame: number /* how many "frames" does it take before our hitbox becomes active? */
    activeFrame: number; /* how long is our hitbox active for? */
    recoveryFrame: number; /* how long is the player unable to do any other actions after the move deactivates? */
    hitstun: number; /* how long is the player stuck in a hit animation after being hit by this attack? */
    hitCastOffsets: Vector3[]; /* where should the hit detection ray start? */
    hitCastVectors: Vector3[]; /* where should the hit detection ray go? */
    launchDirection: Vector3; /* where should the player be launched after being hit by this attack? */
    damage: number;
}

export class HitEvent {
    hitPlayer: Player;
    hurtPlayer: Player;
    attack: Attack;
    launchVector: Vector3;
}

export class Player implements IDisposable {
    private _game: Game;
    private _scene: Scene;
    private _playerIndex: number;
    private _deltaTime: number; /* The time since the last frame, in seconds */
    private _maxDeltaTime: number = 0.0250; /* the max time we want to ever pass between two logical frames */

    public static player1SpriteManager: SpriteManager;
    public static player2SpriteManager: SpriteManager;

    private _transform: TransformNode;
    private _spritePlayerTransform: TransformNode;
    private _spritePlayerOffset: Vector3 = new Vector3(0, 0.5, 0);

    /* input variables */
    private _joystickLDeadZone: Vector3 = new Vector3(0.1, 0.1, 0);
    private _deviceSource: DeviceSource<any>;
    private _moveInput: Vector3 = new Vector3();
    private _jumpInput: boolean;
    private _dashInput: boolean;
    private _lightAttackInput: boolean;
    private _heavyAttackInput: boolean;
    private _switchGunInput: boolean;

    /* player state variables */
    private _dead: boolean;
    private _canMove: boolean;
    private _canJump: boolean;
    private _grounded: boolean;
    private _canBeHit: boolean;
    private _canWallRun: boolean;
    private _facingWall: boolean;
    private _isWallRunning: boolean;
    private _wallRunningJump: boolean;
    private _isWallStuck: boolean;
    private _hitTimer: number;
    private _ammoCount: number;
    private _currentAnimation: AnimationState;
    private _flipped: boolean = false; /* true means that the player is facing left (-X), false means the player is facing right (+X) */
    private _gunDrawn: boolean = false;
    private _health: number;
    private _maxHealth: number = 100;
    private _dieTimer: number = 5;
    private _dieTimerCurrent: number;

    /* physics related variables */
    private _gravity: Vector3 = new Vector3(0, -5, 0);
    private _groundRaycastDirection: Vector3 = new Vector3(0, -1, 0);
    private _groundRaycastOffset: Vector3 =  new Vector3(0, 0.2, 0);
    private _groundRaycastLength: number = 0.21;
    private _wallRaycastDirection: Vector3 = new Vector3(1, 0, 0);
    private _wallRaycastActual: Vector3 = new Vector3(0,0,0);
    private _wallRaycastOffset: Vector3 = new Vector3(0.2, 0, 0);
    private _wallRaycastPositionActual: Vector3 = new Vector3();
    private _wallRaycastLength: number = 0.3;
    private _knockbackDirection: Vector3 = new Vector3();
    private _knockbackSlowdownRate: Vector3 = new Vector3(0.2, 0.2, 0);
    private _wallCollider: Mesh;
    private _hurtboxes: Mesh[];
    private _hitboxes: Mesh[];

    /* movement related variables */
    private _velocity: Vector3 = new Vector3(); /* Current world-space velocity */
    private _groundFriction: Vector3 = new Vector3(0.3, 0, 0);
    private _airFriction: Vector3 = new Vector3(0.1, 0.1, 0);
    private _moveSpeed: number = 3.5;
    private _jumpSpeed: number = 6;
    private _jumpSpeedCurrent: number = 0;
    private _jumpSpeedSlowdownRate: number = 12;
    private _hiJumpModifier = 1.5;
    private _dashSpeed: number = 8;
    private _dashTimer: number = 0.18;
    private _dashTimerElapsed: number = 0;
    private _dashCooldownTimer: number = 0.25;
    private _dashCooldownTimerElapsed: number = 0;
    private _dashDirection: number = 1;
    private _wallRunSpeed: number = 5;
    private _wallRunSpeedCurrent: number = 0;
    private _wallRunSpeedSlowdownRate: number = 8;
    private _wallJumpSpeed: Vector3 = new Vector3(6, 4, 0);
    private _wallJumpSpeedCurrent: Vector3 = new Vector3(0, 0, 0);
    private _wallJumpTimer: number = 0.33;
    private _wallJumpTimerElapsed: number = 0;
    private _wallJumpSpeedSlowdownRate: number = 50;

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
    private _wallRunAnimation: AnimationState = new AnimationState();
    private _wallRunFlipAnimation: AnimationState = new AnimationState();
    private _dieAnimation: AnimationState = new AnimationState();

    /* Attack variables */
    private _light1Attack: Attack = new Attack();
    private _light2Attack: Attack = new Attack();
    private _lightRapidJabAttack: Attack = new Attack();
    private _lightFinisherAttack: Attack = new Attack();
    private _heavy1Attack: Attack = new Attack();
    private _heavyLauncherAttack: Attack = new Attack();
    private _jumpKickAttack: Attack = new Attack();
    private _jumpDiveKickAttack: Attack = new Attack();
    private _shootGunAttack: Attack = new Attack();
    private _jumpShootGunAttack: Attack = new Attack();
    private _hitCastOffsetActual : Vector3 = new Vector3();
    private _hitCastVectorActual : Vector3 = new Vector3();

    /* constructor */
    constructor(game: Game, scene: Scene, playerIndex: number, deviceSource: DeviceSource<any>) {
        console.log("Adding player - " + playerIndex);
        this._game = game;
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
        this._transform = new TransformNode(this.getName(), this._scene);
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
        this._transform.position.copyFrom(this._game.getSpawnPosition(this._playerIndex));
        this._transform.computeWorldMatrix();
        /* this._ammo = this._maxAmmo */
        this._health = this._maxHealth;
        this._dead = false;
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
        this._jumpAnimation.from = 29;
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
            this.player._jumpSpeedCurrent = this.player._jumpSpeed;
            // if player is crouching, do a high jump
            if (this.player._moveInput.y > 0){
                this.player._jumpSpeedCurrent *= this.player._hiJumpModifier;
            }
            console.log("entering jump state");
        };
        this._jumpAnimation.update = () => {
            if (false){
                console.log("engine.getDeltaTime():" + this._deltaTime);
                console.log ("this._jumpSpeedCurrent : " + this._jumpSpeedCurrent);
            }
            this._jumpSpeedCurrent -= this._deltaTime * this._jumpSpeedSlowdownRate;

            /* Allow the player to stop jumping when jump is released */
            if (!this._jumpInput){
                this._jumpSpeedCurrent = 0;
            }
        }
        this._jumpAnimation.stop = function () {
            this.player._jumpSpeedCurrent = 0;
            console.log("leaving jump state");
        }

        /* Jump animation (with gun drawn) frame data and state logic */
        this._jumpGunAnimation.player = this;
        this._jumpGunAnimation.spritePlayer = this._spritePlayer;
        this._jumpGunAnimation.from = 117;
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
            this.player._jumpSpeedCurrent = this.player._jumpSpeed;
            console.log("entering jump-gun state");
        };
        this._jumpGunAnimation.update = () => {
            this._jumpSpeedCurrent -= this._deltaTime * this._jumpSpeedSlowdownRate;
            /* Allow the player to stop jumping when jump is released */
            if (!this._jumpInput){
                this._jumpSpeedCurrent = 0;
            }
        }
        this._jumpGunAnimation.stop = function () {
            this.player._jumpSpeedCurrent = 0;
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
            //console.log("player._dashTimer: " + this._dashTimerElapsed);
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

        this._light1Attack.player = this;
        this._light1Attack.spritePlayer = this._spritePlayer;
        this._light1Attack.from = 62;
        this._light1Attack.to = 65;
        this._light1Attack.speed = 50;
        this._light1Attack.canCancelAfter = 64;
        this._light1Attack.loop = false;
        this._light1Attack.start = function ()
        {
            this.playAnimation();
            this.player._canMove = false;
            this.player._canBeHit = true;
            this.player._canWallRun = false;
            console.log("entering lightAttack2 state");
        }
        this._light1Attack.update = () => {
        }
        this._light1Attack.onAnimationEnd = () => {
            if (this._lightAttackInput){
                this._changeAnimationState(this._light2Attack);
            }
            else {
                this._changeAnimationState(this._idleAnimation);
            }
        }
        this._light1Attack.stop = function () {
            console.log("leaving lightAttack1 state");
        }
        this._light1Attack.hitCastOffsets = [new Vector3(0, 0.53, 0)];
        this._light1Attack.hitCastVectors = [new Vector3(0.64, 0, 0)];
        this._light1Attack.hitstun = 0.1;
        this._light1Attack.launchDirection = new Vector3(0.1, 0, 0);
        this._light1Attack.damage = 5;
        this._light1Attack.startupFrame = 62;
        this._light1Attack.activeFrame = 63;
        this._light1Attack.recoveryFrame = 64;

        this._light2Attack.player = this;
        this._light2Attack.spritePlayer = this._spritePlayer;
        this._light2Attack.from = 66;
        this._light2Attack.to = 70;
        this._light2Attack.speed = 50;
        this._light2Attack.canCancelAfter = 68;
        this._light2Attack.loop = false;
        this._light2Attack.start = function ()
        {
            this.playAnimation();
            this.player._canMove = false;
            this.player._canBeHit = true;
            this.player._canWallRun = false;
            console.log("entering lightAttack2 state");
        }
        this._light2Attack.update = () => {
        }
        this._light2Attack.onAnimationEnd = () => {
            if (this._lightAttackInput){
                this._changeAnimationState(this._lightRapidJabAttack);
            }
            else {
                this._changeAnimationState(this._idleAnimation);
            }
        }
        this._light2Attack.stop = function () {
            console.log("leaving lightAttack2 state");
        }
        this._light2Attack.hitCastOffsets = [new Vector3(0, 0.53, 0)];
        this._light2Attack.hitCastVectors = [new Vector3(0.64, 0, 0)];
        this._light2Attack.hitstun = 0.1;
        this._light2Attack.launchDirection = new Vector3(0.1, 0, 0);
        this._light2Attack.damage = 5;
        this._light2Attack.startupFrame = 66;
        this._light2Attack.activeFrame = 67;
        this._light2Attack.recoveryFrame = 68;

        this._lightRapidJabAttack.player = this;
        this._lightRapidJabAttack.spritePlayer = this._spritePlayer;
        this._lightRapidJabAttack.from = 71;
        this._lightRapidJabAttack.to = 76;
        this._lightRapidJabAttack.speed = 50;
        this._lightRapidJabAttack.canCancelAfter = 68;
        this._lightRapidJabAttack.loop = false;
        this._lightRapidJabAttack.start = function ()
        {
            this.playAnimation();
            this.player._canMove = false;
            this.player._canBeHit = true;
            this.player._canWallRun = false;
            console.log("entering lightAttack2 state");
        }
        this._lightRapidJabAttack.update = () => {
        }
        this._lightRapidJabAttack.onAnimationEnd = () => {
            this._changeAnimationState(this._idleAnimation);
        }
        this._lightRapidJabAttack.stop = function () {
            console.log("leaving lightAttack3 state");
        }
        this._lightRapidJabAttack.hitCastOffsets = [new Vector3(0, 0, 0)];
        this._lightRapidJabAttack.hitCastVectors = [new Vector3(0.64, 0.72, 0)];
        this._lightRapidJabAttack.hitstun = 0.25;
        this._lightRapidJabAttack.launchDirection = new Vector3(1, 10, 0);
        this._lightRapidJabAttack.damage = 10;
        this._lightRapidJabAttack.startupFrame = 71;
        this._lightRapidJabAttack.activeFrame = 73;
        this._lightRapidJabAttack.recoveryFrame = 75;

        this._heavy1Attack.player = this;
        this._heavy1Attack.spritePlayer = this._spritePlayer;
        this._heavy1Attack.from = 77;
        this._heavy1Attack.to = 86;
        this._heavy1Attack.speed = 50;
        this._heavy1Attack.canCancelAfter = 84;
        this._heavy1Attack.loop = false;
        this._heavy1Attack.start = function ()
        {
            this.playAnimation();
            this.player._canMove = false;
            this.player._canBeHit = true;
            this.player._canWallRun = false;
            console.log("entering heavyAttack1 state");
        }
        this._heavy1Attack.update = () => {
        }
        this._heavy1Attack.onAnimationEnd = () => {
            this._changeAnimationState(this._idleAnimation);
        }
        this._heavy1Attack.stop = function () {
            console.log("leaving heavyAttack1 state");
        }
        this._heavy1Attack.hitCastOffsets = [new Vector3(0, 0, 0)];
        this._heavy1Attack.hitCastVectors = [new Vector3(0.82, 0, 0)];
        this._heavy1Attack.hitstun = 0.5;
        this._heavy1Attack.launchDirection = new Vector3(10, 5, 0);
        this._heavy1Attack.damage = 25;
        this._heavy1Attack.startupFrame = 77;
        this._heavy1Attack.activeFrame = 83;
        this._heavy1Attack.recoveryFrame = 84;

        this._jumpKickAttack.player = this;
        this._jumpKickAttack.spritePlayer = this._spritePlayer;
        this._jumpKickAttack.from = 49;
        this._jumpKickAttack.to = 49;
        this._jumpKickAttack.speed = 50;
        this._jumpKickAttack.canCancelAfter = 49;
        this._jumpKickAttack.loop = false;
        this._jumpKickAttack.start = function ()
        {
            this.playAnimation();
            this.player._canMove = false;
            this.player._canBeHit = true;
            this.player._canWallRun = false;
            console.log("entering jumpKickAttack state");
        }
        this._jumpKickAttack.update = () => {
        }
        this._jumpKickAttack.onAnimationEnd = () => {
            this._changeAnimationState(this._fallAnimation);
        }
        this._jumpKickAttack.stop = function () {
            console.log("leaving jumpKickAttack state");
        }
        this._jumpKickAttack.hitCastOffsets = [new Vector3(0, 0, 0)];
        this._jumpKickAttack.hitCastVectors = [new Vector3(0.70, 0, 0)];
        this._jumpKickAttack.hitstun = 0.3;
        this._jumpKickAttack.launchDirection = new Vector3(10, 2.5, 0);
        this._jumpKickAttack.damage = 10;
        this._jumpKickAttack.startupFrame = 48;
        this._jumpKickAttack.activeFrame = 49;
        this._jumpKickAttack.recoveryFrame = 50;

        this._jumpDiveKickAttack.player = this;
        this._jumpDiveKickAttack.spritePlayer = this._spritePlayer;
        this._jumpDiveKickAttack.from = 50;
        this._jumpDiveKickAttack.to = 50;
        this._jumpDiveKickAttack.speed = 50;
        this._jumpDiveKickAttack.canCancelAfter = 50;
        this._jumpDiveKickAttack.loop = false;
        this._jumpDiveKickAttack.start = function ()
        {
            this.playAnimation();
            this.player._canMove = false;
            this.player._canBeHit = true;
            this.player._canWallRun = false;
            console.log("entering jumpDiveKickAttack state");
        }
        this._jumpDiveKickAttack.update = () => {
        }
        this._jumpDiveKickAttack.onAnimationEnd = () => {
            this._changeAnimationState(this._fallAnimation);
        }
        this._jumpDiveKickAttack.stop = function () {
            console.log("leaving jumpDiveKickAttack state");
        }
        this._jumpDiveKickAttack.hitCastOffsets = [new Vector3(0, 0.5, 0)];
        this._jumpDiveKickAttack.hitCastVectors = [new Vector3(0.64, -0.72, 0)];
        this._jumpDiveKickAttack.hitstun = 0.3;
        this._jumpDiveKickAttack.launchDirection = new Vector3(10, -20, 0);
        this._jumpDiveKickAttack.damage = 20;
        this._jumpDiveKickAttack.startupFrame = 49;
        this._jumpDiveKickAttack.activeFrame = 50;
        this._jumpDiveKickAttack.recoveryFrame = 51;

        this._shootGunAttack.player = this;
        this._shootGunAttack.spritePlayer = this._spritePlayer;
        this._shootGunAttack.from = 149;
        this._shootGunAttack.to = 152;
        this._shootGunAttack.speed = 50;
        this._shootGunAttack.canCancelAfter = 151;
        this._shootGunAttack.loop = false;
        this._shootGunAttack.start = function ()
        {
            this.playAnimation();
            this.player._canMove = false;
            this.player._canBeHit = true;
            this.player._canWallRun = false;
            console.log("entering shootGunAttack state");

            /* create projectile */
        }
        this._shootGunAttack.update = () => {
        }
        this._shootGunAttack.onAnimationEnd = () => {
            this._changeAnimationState(this._idleGunAnimation);
        }
        this._shootGunAttack.stop = function () {
            console.log("leaving shootGunAttack state");
        }
        this._shootGunAttack.hitCastOffsets = [new Vector3(0, 0.53, 0)];
        this._shootGunAttack.hitCastVectors = [new Vector3(100, 0, 0)];
        this._shootGunAttack.hitstun = 0.3;
        this._shootGunAttack.launchDirection = new Vector3(20, 10, 0);
        this._shootGunAttack.damage = 15;
        this._shootGunAttack.startupFrame = 149;
        this._shootGunAttack.activeFrame = 150;
        this._shootGunAttack.recoveryFrame = 151;

        this._jumpShootGunAttack.player = this;
        this._jumpShootGunAttack.spritePlayer = this._spritePlayer;
        this._jumpShootGunAttack.from = 153;
        this._jumpShootGunAttack.to = 156;
        this._jumpShootGunAttack.speed = 50;
        this._jumpShootGunAttack.canCancelAfter = 155;
        this._jumpShootGunAttack.loop = false;
        this._jumpShootGunAttack.start = function ()
        {
            this.playAnimation();
            this.player._canMove = false;
            this.player._canBeHit = true;
            this.player._canWallRun = false;
            console.log("entering jumpShootGunAttack state");

            /* create projectile */
        }
        this._jumpShootGunAttack.update = () => {
        }
        this._jumpShootGunAttack.onAnimationEnd = () => {
            this._changeAnimationState(this._fallAnimation);
        }
        this._jumpShootGunAttack.stop = function () {
            console.log("leaving jumpShootGunAttack state");
        }
        this._jumpShootGunAttack.hitCastOffsets = [new Vector3(0, 0.53, 0)];
        this._jumpShootGunAttack.hitCastVectors = [new Vector3(100, 0, 0)];
        this._jumpShootGunAttack.hitstun = 0.3;
        this._jumpShootGunAttack.launchDirection = new Vector3(20, 10, 0);
        this._jumpShootGunAttack.damage = 15;
        this._jumpShootGunAttack.startupFrame = 153;
        this._jumpShootGunAttack.activeFrame = 154;
        this._jumpShootGunAttack.recoveryFrame = 155;

        this._wallRunAnimation.player = this;
        this._wallRunAnimation.spritePlayer = this._spritePlayer;
        this._wallRunAnimation.from = 18;
        this._wallRunAnimation.to = 27;
        this._wallRunAnimation.speed = 50;
        this._wallRunAnimation.canCancelAfter = 18;
        this._wallRunAnimation.loop = true;
        this._wallRunAnimation.start = function ()
        {
            this.playAnimation();
            this.player._canMove = false;
            this.player._canBeHit = true;
            this.player._canWallRun = true;
            this.player._wallRunSpeedCurrent = this.player._wallRunSpeed;
            console.log("entering wallRun state");
        }
        this._wallRunAnimation.update = () => {
            this._wallRunSpeedCurrent -= this._deltaTime * this._wallRunSpeedSlowdownRate;
            /* Allow the player to stop wall running when wallRun is released */
            if ((!this._flipped && this._moveInput.x <= 0 || this._flipped && this._moveInput.x >= 0)
                || this._wallRunSpeedCurrent <= 0){
                this._changeAnimationState(this._wallRunFlipAnimation);
            }
        }
        this._wallRunAnimation.onAnimationEnd = () => {
            this._changeAnimationState(this._fallAnimation);
        }
        this._wallRunAnimation.doesMovement = true;
        this._wallRunAnimation.doMovement = () => {
            this._velocity.copyFromFloats(0, this._wallRunSpeedCurrent, 0);
            this._transform.position.addInPlace(this._velocity.scale(this._deltaTime));
        }
        this._wallRunAnimation.stop = function () {
            this.player._wallRunSpeedCurrent = 0;
            console.log("leaving wallRun state");
        }

        this._wallRunFlipAnimation.player = this;
        this._wallRunFlipAnimation.spritePlayer = this._spritePlayer;
        this._wallRunFlipAnimation.from = 51;
        this._wallRunFlipAnimation.to = 54;
        this._wallRunFlipAnimation.speed = 50;
        this._wallRunFlipAnimation.canCancelAfter = 51;
        this._wallRunFlipAnimation.loop = false;
        this._wallRunFlipAnimation.start = function ()
        {
            this.playAnimation();
            this.player._canMove = false;
            this.player._canBeHit = true;
            this.player._canWallRun = true;
            this.player._wallJumpSpeedCurrent.copyFrom(this.player._wallJumpSpeed);
            console.log("entering wallRunFlip state");
        }
        this._wallRunFlipAnimation.update = () => {
            this._wallJumpTimerElapsed -= this._deltaTime;
            this._wallJumpSpeedCurrent.copyFromFloats(this._wallJumpSpeedCurrent.x, this._wallJumpSpeedCurrent.y - this._deltaTime * this._wallJumpSpeedSlowdownRate, this._wallJumpSpeedCurrent.z);
            /* Allow the player to stop wall running when wallRun is released */
            if (this._wallJumpTimerElapsed <= 0){
                this._changeAnimationState(this._wallRunFlipAnimation);
            }
        }
        this._wallRunFlipAnimation.doesMovement = true;
        this._wallRunFlipAnimation.doMovement = () => {
            this._velocity.copyFromFloats(this._flipped ? this._wallJumpSpeedCurrent.x : -this._wallJumpSpeedCurrent.x, this._wallJumpSpeedCurrent.y, this._wallJumpSpeedCurrent.z);
            this._transform.position.addInPlace(this._velocity.scale(this._deltaTime));
        }
        this._wallRunFlipAnimation.onAnimationEnd = () => {
            this._changeAnimationState(this._fallAnimation);
        }
        this._wallRunFlipAnimation.stop = function () {
            this._wallJumpSpeedCurrent = 0;
            console.log("leaving wallRunFlip state");
        }

        this._hitAnimation.player = this;
        this._hitAnimation.spritePlayer = this._spritePlayer;
        this._hitAnimation.from = 87;
        this._hitAnimation.to = 87;
        this._hitAnimation.speed = 50;
        this._hitAnimation.loop = false;
        this._hitAnimation.canCancelAfter = 87;
        this._hitAnimation.start = function()
        {
            this.playAnimation();
            this.player._canMove = false;
            this.player._canBeHit = false;
            this.player._canWallRun = false;
            console.log("entering Hit state");
        }
        this._hitAnimation.update = () => {
            if (this._hitTimer <= 0){
                this._changeAnimationState(this._idleAnimation);
            }
        };
        this._hitAnimation.doesMovement = true;
        this._hitAnimation.doMovement = () => {
            this._velocity.copyFrom(this._knockbackDirection);
            this._transform.position.addInPlace(this._velocity.scale(this._deltaTime));
        }

        this._dieAnimation.player = this;
        this._dieAnimation.spritePlayer = this._spritePlayer;
        this._dieAnimation.from = 87;
        this._dieAnimation.to = 87;
        this._dieAnimation.speed = 50;
        this._dieAnimation.loop = false;
        this._dieAnimation.canCancelAfter = 87;
        this._dieAnimation.start = function()
        {
            this.playAnimation();
            this.player._canMove = false;
            this.player._canBeHit = false;
            this.player._canWallRun = false;
            console.log("entering Die state");
            this.player._dieTimerCurrent = 0;
        }
        this._dieAnimation.update = () => {
            this._dieTimerCurrent += this._deltaTime;
        };


        return Promise.resolve();
    }

    private _setupSpritePlayer(): void{
        this._spritePlayerTransform = new TransformNode(this.getName() + "_SpritePlayer", this._scene);
        this._spritePlayerTransform.setParent(this._transform);
        this._spritePlayerTransform.position.copyFrom(this._spritePlayerOffset);
        switch(this._playerIndex) {
            case 1:
                this._spritePlayer = new Sprite("Player_1_CharacterSprite", Player.player2SpriteManager);
                break;
            case 0:
            default:
                this._spritePlayer = new Sprite("Player_0_CharacterSprite", Player.player1SpriteManager);
                break;
        }

        this._scene.onBeforeRenderObservable.add(() => {
            this._spritePlayerTransform.computeWorldMatrix();
            this._spritePlayer.position.copyFrom(this._spritePlayerTransform.absolutePosition);
        });
    }

    /* Frame Update */
    private _onBeforeRender() {
        this._deltaTime = Math.min(this._scene.getEngine().getDeltaTime()/1000, this._maxDeltaTime);
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
                this._moveInput.copyFromFloats(this._deviceSource.getInput(DualShockInput.LStickXAxis) + this._deviceSource.getInput(DualShockInput.DPadRight) - this._deviceSource.getInput(DualShockInput.DPadLeft),
                                               this._deviceSource.getInput(DualShockInput.LStickYAxis) + this._deviceSource.getInput(DualShockInput.DPadUp)    - this._deviceSource.getInput(DualShockInput.DPadDown),
                                               0);
                this._jumpInput = this._deviceSource.getInput(DualShockButton.Cross) != 0;
                this._dashInput = this._deviceSource.getInput(DualShockButton.R1) != 0;
                this._lightAttackInput = this._deviceSource.getInput(DualShockButton.Square) != 0;
                this._heavyAttackInput = this._deviceSource.getInput(DualShockButton.Triangle) != 0;
                this._switchGunInput = this._deviceSource.getInput(DualShockButton.Circle) != 0;
                break;
            case DeviceType.Switch:
                this._moveInput.copyFromFloats(this._deviceSource.getInput(SwitchInput.LStickXAxis) + this._deviceSource.getInput(SwitchInput.DPadRight) - this._deviceSource.getInput(SwitchInput.DPadLeft),
                                               this._deviceSource.getInput(SwitchInput.LStickYAxis) + this._deviceSource.getInput(SwitchInput.DPadUp)    - this._deviceSource.getInput(SwitchInput.DPadDown),
                                               0);
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
                this._moveInput.copyFromFloats(this._deviceSource.getInput(XboxInput.LStickXAxis) + this._deviceSource.getInput(XboxInput.DPadRight) - this._deviceSource.getInput(XboxInput.DPadLeft),
                                               this._deviceSource.getInput(XboxInput.LStickYAxis) + this._deviceSource.getInput(XboxInput.DPadUp)    - this._deviceSource.getInput(XboxInput.DPadDown),
                                               0);
                this._jumpInput = this._deviceSource.getInput(XboxInput.A) != 0;
                this._dashInput = this._deviceSource.getInput(XboxInput.RB) != 0;
                this._lightAttackInput = this._deviceSource.getInput(XboxInput.X) != 0;
                this._heavyAttackInput = this._deviceSource.getInput(XboxInput.Y) != 0;
                this._switchGunInput = this._deviceSource.getInput(XboxInput.B) != 0;
                break;
        }

        /* Apply input deadzones */
        if (Math.abs(this._moveInput.x) < this._joystickLDeadZone.x){
            this._moveInput.x = 0;
        }
        if (Math.abs(this._moveInput.y) < this._joystickLDeadZone.y){
            this._moveInput.y = 0;
        }
    }

    private _checkColliders(): void {
        /* check for ground */
        let groundRay = new Ray(this._transform.position.add(this._groundRaycastOffset), this._groundRaycastDirection, this._groundRaycastLength);
        let getGroundMeshes = (mesh: Mesh) => {
            return mesh.isPickable && mesh.layerMask & Game.GROUND_LAYER && mesh.isEnabled();
        }
        let groundRayPick = this._scene.pickWithRay(groundRay, getGroundMeshes);
        let groundRayHelper = new RayHelper(groundRay);
        this._grounded = groundRayPick.hit;
        if (this._grounded){
            if (false) {
                console.log("Standing on ground mesh: \"" + groundRayPick.pickedMesh.name + "\"");
            }
            this._transform.position.copyFromFloats(this._transform.position.x, groundRayPick.pickedPoint.y, this._transform.position.z);
        }

        let getWallMeshes = (mesh: Mesh) => {
            return mesh.isPickable && mesh.layerMask & Game.WALL_LAYER && mesh.isEnabled();
        }
        /* check for walls */
        this._wallRaycastDirection.rotateByQuaternionToRef(this._transform.rotationQuaternion, this._wallRaycastActual);
        this._wallRaycastOffset.rotateByQuaternionToRef(this._transform.rotationQuaternion, this._wallRaycastPositionActual);
        this._wallRaycastPositionActual.addInPlace(this._transform.position);
        let wallRay = new Ray(this._wallRaycastPositionActual, this._wallRaycastActual, this._wallRaycastLength);
        let wallRayPick = this._scene.pickWithRay(wallRay, getWallMeshes);
        this._facingWall = wallRayPick.hit;
        if (this._facingWall){
            if (true){
                console.log("Touching wall mesh: \"" + wallRayPick.pickedMesh.name + "\"");
            }
        }

        /* check for hits */
        if (this._currentAnimation instanceof Attack){
            //
            let currentAttack = (this._currentAnimation as Attack);
            let frame = this._spritePlayer.cellIndex;

            let getHurtboxes = (mesh: Mesh) => {
                return mesh.isPickable && mesh.layerMask & Game.HURTBOX_LAYER && mesh.isEnabled() && mesh.parent != this._transform;
            }

            if (frame >= currentAttack.activeFrame && frame < currentAttack.recoveryFrame){
                let attackHit = false;
                for(let i = 0; i < currentAttack.hitCastVectors.length; ++i){
                    this._hitCastOffsetActual.copyFrom(currentAttack.hitCastOffsets[Math.min(i, currentAttack.hitCastOffsets.length-1)]);
                    this._hitCastOffsetActual.rotateByQuaternionToRef(this._transform.rotationQuaternion, this._hitCastOffsetActual);
                    this._hitCastOffsetActual.addInPlace(this._transform.position);

                    this._hitCastVectorActual.copyFrom(currentAttack.hitCastVectors[i]);
                    this._hitCastVectorActual.rotateByQuaternionToRef(this._transform.rotationQuaternion, this._hitCastVectorActual);
                    let hitRay = new Ray(this._hitCastOffsetActual, this._hitCastVectorActual, this._hitCastVectorActual.length());
                    let hitRayPick = this._scene.pickWithRay(hitRay, getHurtboxes);
                    if (hitRayPick.hit){
                        let hurtPlayer : Player;
                        let hurtBox = hitRayPick.pickedMesh as Mesh;
                        this._game.players.forEach((player) => {
                            if (player._hurtboxes.indexOf(hurtBox) != -1 ){
                                hurtPlayer = player;
                                return;
                            }
                        });
                        let launchVectorActual: Vector3 = new Vector3(currentAttack.launchDirection.x, currentAttack.launchDirection.y, currentAttack.launchDirection.z);
                        launchVectorActual.rotateByQuaternionToRef(this._transform.rotationQuaternion, launchVectorActual);
                        this._game.reportHit(<HitEvent>{hitPlayer: this, hurtPlayer: hurtPlayer, attack: currentAttack, launchVector: launchVectorActual});
                    }
                }
            }
        }
    }

    private _doMovement(): void {
        /* do knockback related movement, and knockback vector degradation */
        if (this._knockbackDirection.length() > 0){
            this._knockbackDirection.copyFromFloats(Math.abs(this._knockbackDirection.x) > this._knockbackSlowdownRate.x ? (this._knockbackDirection.x > 0 ? (this._knockbackDirection.x - this._knockbackSlowdownRate.x) : this._knockbackDirection.x + this._knockbackSlowdownRate.x) : 0,
                                                    Math.abs(this._knockbackDirection.y) > this._knockbackSlowdownRate.y ? (this._knockbackDirection.y > 0 ? (this._knockbackDirection.y - this._knockbackSlowdownRate.y) : this._knockbackDirection.y + this._knockbackSlowdownRate.y) : 0,
                                                    Math.abs(this._knockbackDirection.z) > this._knockbackSlowdownRate.z ? (this._knockbackDirection.z > 0 ? (this._knockbackDirection.z - this._knockbackSlowdownRate.z) : this._knockbackDirection.z + this._knockbackSlowdownRate.z) : 0);
            this._velocity.copyFrom(this._knockbackDirection);
        }

        if (this._currentAnimation && this._currentAnimation.doesMovement){
            this._currentAnimation.doMovement();
        } else {
            if (this._canMove) {
                /* set the movement vector using the player locomotion */
                this._velocity.copyFromFloats(this._velocity.x * (1 - (this._grounded ? this._groundFriction.x : this._airFriction.x)),
                                              this._velocity.y * (1 - (this._grounded ? this._groundFriction.y : this._airFriction.y)),
                                              this._velocity.z * (1 - (this._grounded ? this._groundFriction.z : this._airFriction.z)));
                if (!this._grounded && this._jumpSpeedCurrent <= 0){
                    this.doGravityMovement(this._velocity);
                }else if (this._grounded){
                    this._velocity.y = 0;
                }
                this.doHorizontalMovement(this._velocity);
                if (this._jumpSpeedCurrent > 0) {
                    this.doJumpMovement(this._velocity);
                }
            }
            let posDelta = this._velocity.scale(this._deltaTime);
            this._transform.position.addInPlace(posDelta);
        }
        this.applyBounds();
    }

    private applyBounds(): void{
        this._transform.position.copyFromFloats(Math.min(this._transform.position.x, this._game.playerMaxPosition.x - this._wallRaycastOffset.x),
                                                Math.min(this._transform.position.y, this._game.playerMaxPosition.y),
                                                Math.min(this._transform.position.z, this._game.playerMaxPosition.z));
        this._transform.position.copyFromFloats(Math.max(this._transform.position.x, this._game.playerMinPosition.x + this._wallRaycastOffset.x),
                                                Math.max(this._transform.position.y, this._game.playerMinPosition.y),
                                                Math.max(this._transform.position.z, this._game.playerMinPosition.z));
    }

    public doGravityMovement(moveVector: Vector3): void {
        moveVector.addInPlace(this._gravity);
        //moveVector.addInPlace(this._gravity.scale(this._deltaTime));
        if (moveVector.y < this._gravity.y){
            moveVector.y = this._gravity.y;
        }
    }

    private doHorizontalMovement(moveVector: Vector3): void {
        let moveSpeed: Vector3 = this._moveInput.scale(this._moveSpeed);
        moveSpeed.y = 0;
        moveSpeed.z = 0;
        moveVector.addInPlace(moveSpeed);
        if (moveVector.x > this._moveSpeed) {
            moveVector.x = this._moveSpeed;
        }
        if (moveVector.x < -this._moveSpeed) {
            moveVector.x = -this._moveSpeed;
        }
    }

    public doJumpMovement(moveVector: Vector3): void {
        moveVector.addInPlaceFromFloats(0, this._jumpSpeedCurrent, 0);
        if (moveVector.y > this._jumpSpeedCurrent){
            moveVector.y = this._jumpSpeedCurrent;
        }
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
        if (this._dead){
            if (this._dieTimerCurrent >= this._dieTimer){
                this.reset();
                return;
            }
            this._changeAnimationState(this._dieAnimation);
        } else if (this._hitTimer > 0) {
            if (this._gunDrawn) {
                this._changeAnimationState(this._hitGunAnimation);
            } else {
                this._changeAnimationState(this._hitAnimation)
            }
            return;
        } else if (this._canMove) {
            if ((this._facingWall && this._canWallRun) || this._wallJumpTimerElapsed > 0){
                this._changeAnimationState(this._wallRunAnimation);
            } else if (this._lightAttackInput) {
                if (this._gunDrawn) {
                    if (this._grounded){
                        this._changeAnimationState(this._shootGunAttack);
                    }else{
                        this._changeAnimationState(this._jumpShootGunAttack);
                    }
                } else {
                    if (this._grounded){
                        this._changeAnimationState(this._light1Attack);
                    } else {
                        this._changeAnimationState(this._jumpKickAttack);
                    }
                }
            } else if (this._heavyAttackInput) {
                if (this._gunDrawn) {
                    if (this._grounded){
                        this._changeAnimationState(this._shootGunAttack);
                    }
                    else{
                        this._changeAnimationState(this._jumpShootGunAttack)
                    }
                } else {
                    if (this._grounded){
                        this._changeAnimationState(this._heavy1Attack);
                    } else {
                        this._changeAnimationState(this._jumpDiveKickAttack);
                    }
                }
            } else if (this._switchGunInput) {
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
            } else if ((this._canJump && this._jumpInput) || this._jumpSpeedCurrent > 0) {
                if (this._gunDrawn) {
                    this._changeAnimationState(this._jumpGunAnimation);
                } else {
                    this._changeAnimationState(this._jumpAnimation);
                }
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
        let hurtbox = MeshBuilder.CreateBox(this.getName()+"_hurtbox", {
            width: 0.5, height: 1, depth: 0.5
        }, this._scene);
        hurtbox.layerMask = Game.HURTBOX_LAYER | Game.DEFAULT_LAYER;
        this._hurtboxes.push(hurtbox);

        /* offset the player collider such that the transform origin is at the collider's bottom */
        hurtbox.position = new Vector3(0, 0.5, 0);
        hurtbox.bakeCurrentTransformIntoVertices();
        hurtbox.setParent(this._transform);
    }

    public onHit(hit: HitEvent): void {
        if (true){
            console.log(this.getName() + " hit By " + hit.hitPlayer.getName());
        }

        if (this._canBeHit){
            this._hitTimer = hit.attack.hitstun;
            this._knockbackDirection.copyFrom(hit.launchVector);
            this._takeDamage(hit.attack.damage);
        }
    }

    private _takeDamage(damage: number){
        if (true){
            console.log(this.getName() + " took " + damage + " damage.");
        }
        this._health -= damage;
        if (this._health <= 0){
            this.die();
        }
    }

    public die(){
        console.log(this.getName() + " died.");
        this._changeAnimationState(this._dieAnimation);
        this._dead = true;
    }

    public dispose(){
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

    public  getName(): string{
        return "Player_" + this._playerIndex;
    }
}