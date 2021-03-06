import { Sound } from "@babylonjs/core/Audio"
import { IDisposable, Scene } from "@babylonjs/core/scene";
import { Color3, Vector3 } from "@babylonjs/core/Maths";
import { TransformNode, Mesh, MeshBuilder } from "@babylonjs/core/Meshes";
import { Observable } from "@babylonjs/core/Misc"
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

export class AnimationState extends AnimationStateBase {

}

export class Attack extends AnimationState {
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
    protected _game: Game;
    protected _scene: Scene;
    protected _playerIndex: number;
    protected _deltaTime: number; /* The time since the last frame, in seconds */
    private _maxDeltaTime: number = 0.0250; /* the max time we want to ever pass between two logical frames */

    public static player1SpriteManager: SpriteManager;
    public static player2SpriteManager: SpriteManager;

    private _transform: TransformNode;
    private _spritePlayerTransform: TransformNode;
    private _spritePlayerOffset: Vector3 = new Vector3(0, 0.5, 0);

    /* input variables */
    private _joystickLDeadZone: Vector3 = new Vector3(0.1, 0.1, 0);
    private _deviceSource: DeviceSource<any>;
    private _useTouchscreen: boolean;
    protected _moveInput: Vector3 = new Vector3();
    protected _jumpInput: boolean;
    protected _dashInput: boolean;
    protected _lightAttackInput: boolean;
    protected _heavyAttackInput: boolean;
    protected _switchGunInput: boolean;

    get deviceSource(): DeviceSource<any>{
        return this._deviceSource;
    }
    set deviceSource(deviceSource: DeviceSource<any>){
        this._deviceSource = deviceSource;
        if (deviceSource.deviceType == DeviceType.Touch){
            this._useTouchscreen = true;
        } else {
            this._useTouchscreen = false;
        }
    }

    /* player state variables */
    private _enabled: boolean;
    private _dead: boolean;
    private _canMove: boolean;
    private _canTransition: boolean;
    private _canJump: boolean;
    private _grounded: boolean;
    private _canBeHit: boolean;
    private _canWallRun: boolean;
    private _wallRanAlready: boolean;
    private _facingWall: boolean;
    private _isWallRunning: boolean;
    private _wallRunningJump: boolean;
    private _isWallStuck: boolean;
    private _hitTimer: number;
    private _ammoCount: number;
    protected _currentAnimation: AnimationState;
    protected _flipped: boolean = false; /* true means that the player is facing left (-X), false means the player is facing right (+X) */
    protected _gunDrawn: boolean = false;
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

    protected _idleAnimation: AnimationState = new AnimationState();
    protected _runAnimation: AnimationState = new AnimationState();
    protected _jumpAnimation: AnimationState = new AnimationState();
    protected _fallAnimation: AnimationState = new AnimationState();
    protected _hitAnimation: AnimationState = new AnimationState();
    protected _landAnimation: AnimationState = new AnimationState();
    protected _dashAnimation: AnimationState = new AnimationState();
    protected _idleGunAnimation: AnimationState = new AnimationState();
    protected _runGunAnimation: AnimationState = new AnimationState();
    protected _jumpGunAnimation: AnimationState = new AnimationState();
    protected _fallGunAnimation: AnimationState = new AnimationState();
    protected _hitGunAnimation: AnimationState = new AnimationState();
    protected _landGunAnimation: AnimationState = new AnimationState();
    protected _dashGunAnimation: AnimationState = new AnimationState();
    protected _switchGunAnimation: AnimationState = new AnimationState();
    protected _switchGunReverseAnimation: AnimationState = new AnimationState();
    protected _wallRunAnimation: AnimationState = new AnimationState();
    protected _wallRunFlipAnimation: AnimationState = new AnimationState();
    protected _dieAnimation: AnimationState = new AnimationState();

    /* Attack variables */
    protected _light1Attack: Attack = new Attack();
    protected _light2Attack: Attack = new Attack();
    protected _lightRapidJabAttack: Attack = new Attack();
    protected _lightFinisherAttack: Attack = new Attack();
    protected _heavy1Attack: Attack = new Attack();
    protected _heavyLauncherAttack: Attack = new Attack();
    protected _jumpKickAttack: Attack = new Attack();
    protected _jumpDiveKickAttack: Attack = new Attack();
    protected _shootGunAttack: Attack = new Attack();
    protected _shootGunPos45Attack: Attack = new Attack();
    protected _jumpShootGunAttack: Attack = new Attack();
    protected _jumpShootGunPos45Attack: Attack = new Attack();
    protected _jumpShootGunNeg45Attack: Attack = new Attack();
    private _hitCastOffsetActual : Vector3 = new Vector3();
    private _hitCastVectorActual : Vector3 = new Vector3();

    /* Attack special movement variables */
    private _lightFinisherAttackVelocity: Vector3 = new Vector3(25, 0, 0);
    private _lightFinisherAttackVelocityCurrent: Vector3 = new Vector3();
    private _jumpDiveKickAttackVelocity: Vector3 = new Vector3(6, -6, 0);
    private _jumpDiveKickAttackVelocityCurrent: Vector3 = new Vector3();

    /* Sounds */
    //private _runSound: Sound;
    //private _wallRunSound: Sound;
    public static _jumpSound: Sound;
    public static _dashSound: Sound;
    //public static _attackSound: Sound;
    public static _hitSound: Sound;
    public static _gunSound: Sound;
    public static _switchGunSound: Sound;
    public static _dieSound: Sound;

    /* Observables */
    public onHealthChanged: Observable<number>  = new Observable<number>();

    /* constructor */
    constructor(game: Game, scene: Scene, playerIndex: number, deviceSource: DeviceSource<any>, enabled: boolean = false, useTouchscreen: boolean = false) {
        console.log("Adding player - " + playerIndex);
        this._game = game;
        this._scene = scene;
        this._playerIndex = playerIndex;
        this._deviceSource = deviceSource;
        this._useTouchscreen = useTouchscreen;
        this.setEnabled(enabled);
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

    public setEnabled(enabled:boolean) : void {
        this._enabled = enabled;
    }

    public reset(startPosition: Vector3 = Vector3.Zero()) {
        this._changeAnimationState(this._idleAnimation);
        this._gunDrawn = false;
        this._transform.position.copyFrom(this._game.getSpawnPosition(this._playerIndex));
        this._transform.computeWorldMatrix();
        /* this._ammo = this._maxAmmo */
        this._setHealth(this._maxHealth);
        this._dead = false;
    }

    public static loadSounds(scene: Scene): Promise<any>{
        return Promise.resolve().then(() => {
            Player._jumpSound = new Sound("jumpSound", "./Sounds/Jump.wav", scene, null, {volume: 1.0});
            Player._hitSound = new Sound("hitSound", "./Sounds/punch_grit_wet_impact_05.wav", scene, null, {volume: 0.6});
            Player._gunSound = new Sound("gunSound", "./Sounds/gun_revolver_pistol_shot.wav", scene, null, {volume: 0.75});
            Player._switchGunSound = new Sound("gunSound", "./Sounds/gun_semi_auto_rifle_cock.wav", scene, null, {volume: 0.7});
            Player._dashSound = new Sound("dashSound", "./Sounds/Dash.wav", scene, null, {volume: 1.0});
            Player._dieSound = new Sound("dashSound", "./Sounds/DeathWail-Male.wav", scene, null, {volume: 0.7});
        });
    }

    /* Animations */
    private _setupAnimations(): Promise<any>{
        this._setupSpritePlayer();

        /* NOTE: The animation frame data can be defined and loaded from JSON, or some other
                 source if you want to support extensible animations, but for the
                 sake of implementation complexity, I decided to statically define
                 the animation and state logic. WARNING: LOTS OF HARD CODED VALUES */

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
            this.player._canTransition = true;
            this.player._canJump = true;
            this.player._canBeHit = true;
            this.player._canWallRun = false;
            this.player._wallRanAlready = false;
        };
        this._idleAnimation.stop = function () {
        }

        /* idle (with gun drawn) frame data and state logic */
        this._idleGunAnimation.player = this;
        this._idleGunAnimation.spritePlayer = this._spritePlayer;
        this._idleGunAnimation.from = 127;
        this._idleGunAnimation.to = 144;
        this._idleGunAnimation.speed = 100;
        this._idleGunAnimation.canCancelAfter = 0;
        this._idleGunAnimation.loop = true;
        this._idleGunAnimation.start = function () {
            this.playAnimation();
            this.player._canMove = true;
            this.player._canTransition = true;
            this.player._canJump = true;
            this.player._canBeHit = true;
            this.player._canWallRun = false;
            this.player._wallRanAlready = false;
        };
        this._idleGunAnimation.stop = function () {
        }

        /* switch from hand-to-hand to gun-drawn player states */
        this._switchGunAnimation.player = this;
        this._switchGunAnimation.spritePlayer = this._spritePlayer;
        this._switchGunAnimation.from = 251;
        this._switchGunAnimation.to = 255;
        this._switchGunAnimation.speed = 33;
        this._switchGunAnimation.canCancelAfter = 0;
        this._switchGunAnimation.loop = false;
        this._switchGunAnimation.start = function () {
            this.playAnimation();
            this.player._canMove = false;
            this.player._canTransition = false;
            this.player._canJump = false;
            this.player._canBeHit = true;
            this.player._canWallRun = false;
            Player._switchGunSound.play();
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
        }

        /* switch from gun-drawn to hand-to-hand  player states */
        this._switchGunReverseAnimation.player = this;
        this._switchGunReverseAnimation.spritePlayer = this._spritePlayer;
        this._switchGunReverseAnimation.from = 251;
        this._switchGunReverseAnimation.to = 255;
        this._switchGunReverseAnimation.speed = 33;
        this._switchGunReverseAnimation.canCancelAfter = 0;
        this._switchGunReverseAnimation.reverse = true;
        this._switchGunReverseAnimation.loop = false;
        this._switchGunReverseAnimation.start = function () {
            this.playAnimation();
            this.player._canMove = false;
            this.player._canTransition = false;
            this.player._canJump = false;
            this.player._canBeHit = true;
            this.player._canWallRun = false;
            this.player._wallRanAlready = false;
            Player._switchGunSound.play();
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
            this.player._canTransition = true;
            this.player._canJump = true;
            this.player._canBeHit = true;
            this.player._canWallRun = false;
            this.player._wallRanAlready = false;
        };
        this._runAnimation.update = () => {
            if (this._moveInput.x > 0 && this._flipped ||
                this._moveInput.x < 0 && !this._flipped ) {
                    this._flip();
            }
        }
        this._runAnimation.stop = function () {
        }

        /* running (with gun drawn) animation frame data and state logic */
        this._runGunAnimation.player = this;
        this._runGunAnimation.spritePlayer = this._spritePlayer;
        this._runGunAnimation.from = 145;
        this._runGunAnimation.to = 154;
        this._runGunAnimation.speed = 100;
        this._runGunAnimation.canCancelAfter = 0;
        this._runGunAnimation.loop = true;
        this._runGunAnimation.start = function () {
            this.playAnimation();
            this.player._canMove = true;
            this.player._canTransition = true;
            this.player._canJump = true;
            this.player._canBeHit = true;
            this.player._canWallRun = false;
            this.player._wallRanAlready = false;
        };
        this._runGunAnimation.update = () => {
            if (this._moveInput.x > 0 && this._flipped ||
                this._moveInput.x < 0 && !this._flipped ) {
                    this._flip();
            }
        }
        this._runGunAnimation.stop = function () {
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
            this.player._canTransition = true;
            this.player._canJump = false;
            this.player._canBeHit = true;
            this.player._canWallRun = true;
            if (this.player._jumpSpeedCurrent <= 0){
                this.player._jumpSpeedCurrent = this.player._jumpSpeed;

                // if player is crouching, do a high jump
                if (this.player._moveInput.y > 0){
                    this.player._jumpSpeedCurrent *= this.player._hiJumpModifier;
                }
            }
            Player._jumpSound.play();
        };
        this._jumpAnimation.update = () => {
            /* Allow the player to stop jumping when jump is released */
            if (!this._jumpInput){
                this._jumpSpeedCurrent = 0;
            }
        }
        this._jumpAnimation.stop = function () {
        }

        /* Jump animation (with gun drawn) frame data and state logic */
        this._jumpGunAnimation.player = this;
        this._jumpGunAnimation.spritePlayer = this._spritePlayer;
        this._jumpGunAnimation.from = 156;
        this._jumpGunAnimation.to = 163;
        this._jumpGunAnimation.speed = 100;
        this._jumpGunAnimation.canCancelAfter = 0;
        this._jumpGunAnimation.loop = false;
        this._jumpGunAnimation.start = function () {
            this.playAnimation();
            this.player._canMove = true;
            this.player._canTransition = true;
            this.player._canJump = false;
            this.player._canBeHit = true;
            this.player._canWallRun = true;
            if (this.player._jumpSpeedCurrent <= 0){
                this.player._jumpSpeedCurrent = this.player._jumpSpeed;

                // if player is crouching, do a high jump
                if (this.player._moveInput.y > 0){
                    this.player._jumpSpeedCurrent *= this.player._hiJumpModifier;
                }
            }
            Player._jumpSound.play();
        };
        this._jumpGunAnimation.update = () => {
            /* Allow the player to stop jumping when jump is released */
            if (!this._jumpInput){
                this._jumpSpeedCurrent = 0;
            }
        }
        this._jumpGunAnimation.stop = function () {
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
            this.player._jumpSpeedCurrent = 0;
            this.player._canMove = true;
            this.player._canTransition = true;
            this.player._canJump = false;
            this.player._canBeHit = true;
            this.player._canWallRun = true;
        };
        this._fallAnimation.stop = function () {
        }


        /* Fall animation (with gun drawn) frame data and state logic */
        this._fallGunAnimation.player = this;
        this._fallGunAnimation.spritePlayer = this._spritePlayer;
        this._fallGunAnimation.from = 163;
        this._fallGunAnimation.to = 175;
        this._fallGunAnimation.speed = 100;
        this._fallGunAnimation.canCancelAfter = 0;
        this._fallGunAnimation.loop = false;
        this._fallGunAnimation.start = function () {
            this.playAnimation();
            this.player._canMove = true;
            this.player._canTransition = true;
            this.player._canJump = false;
            this.player._canBeHit = true;
            this.player._canWallRun = true;
        };
        this._fallGunAnimation.stop = function () {
        }

        /* dash animation frame data and state logic */
        this._dashAnimation.player = this;
        this._dashAnimation.spritePlayer = this._spritePlayer;
        this._dashAnimation.from = 71;
        this._dashAnimation.to = 77;
        this._dashAnimation.speed = 100;
        this._dashAnimation.canCancelAfter = 0;
        this._dashAnimation.loop = false;
        this._dashAnimation.start = function () {
            this.playAnimation();
            this.player._jumpSpeedCurrent = 0;
            this.player._canMove = false;
            this.player._canTransition = false;
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
            Player._dashSound.play();
        }
        this._dashAnimation.update = () => {
            this._dashTimerElapsed -= this._deltaTime;
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
            this._dashCooldownTimerElapsed = this._dashCooldownTimer;
        }

        /* dash animation (with gun drawn) frame data and state logic */
        this._dashGunAnimation.player = this;
        this._dashGunAnimation.spritePlayer = this._spritePlayer;
        this._dashGunAnimation.from = 181;
        this._dashGunAnimation.to = 187;
        this._dashGunAnimation.speed = 100;
        this._dashGunAnimation.canCancelAfter = 0;
        this._dashGunAnimation.loop = false;
        this._dashGunAnimation.start = function () {
            this.playAnimation();
            this.player._canMove = false;
            this.player._canTransition = false;
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
            Player._dashSound.play();
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
            this._dashCooldownTimerElapsed = this._dashCooldownTimer;
        }

        /* */

        this._light1Attack.player = this;
        this._light1Attack.spritePlayer = this._spritePlayer;
        this._light1Attack.from = 79;
        this._light1Attack.to = 82;
        this._light1Attack.speed = 50;
        this._light1Attack.canCancelAfter = 82;
        this._light1Attack.loop = false;
        this._light1Attack.start = function ()
        {
            this.playAnimation();
            this.player._canMove = false;
            this.player._canTransition = false;
            this.player._canBeHit = true;
            this.player._canWallRun = false;
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
        this._light1Attack.doesMovement = false;
        this._light1Attack.stop = function () {
        }
        this._light1Attack.hitCastOffsets = [new Vector3(0, 0.53, 0)];
        this._light1Attack.hitCastVectors = [new Vector3(0.64, 0, 0)];
        this._light1Attack.hitstun = 0.1;
        this._light1Attack.launchDirection = new Vector3(1, 0, 0);
        this._light1Attack.damage = 5;
        this._light1Attack.startupFrame = 78;
        this._light1Attack.activeFrame = 80;
        this._light1Attack.recoveryFrame = 81;

        /* */

        this._light2Attack.player = this;
        this._light2Attack.spritePlayer = this._spritePlayer;
        this._light2Attack.from = 83;
        this._light2Attack.to = 87;
        this._light2Attack.speed = 50;
        this._light2Attack.canCancelAfter = 87;
        this._light2Attack.loop = false;
        this._light2Attack.start = function ()
        {
            this.playAnimation();
            this.player._canMove = false;
            this.player._canTransition = false;
            this.player._canBeHit = true;
            this.player._canWallRun = false;
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
        }
        this._light2Attack.doesMovement = false;
        this._light2Attack.hitCastOffsets = [new Vector3(0, 0.53, 0)];
        this._light2Attack.hitCastVectors = [new Vector3(0.64, 0, 0)];
        this._light2Attack.hitstun = 0.1;
        this._light2Attack.launchDirection = new Vector3(1, 0, 0);
        this._light2Attack.damage = 5;
        this._light2Attack.startupFrame = 82;
        this._light2Attack.activeFrame = 84;
        this._light2Attack.recoveryFrame = 86;

        /* */

        this._lightRapidJabAttack.player = this;
        this._lightRapidJabAttack.spritePlayer = this._spritePlayer;
        this._lightRapidJabAttack.from = 88;
        this._lightRapidJabAttack.to = 93;
        this._lightRapidJabAttack.speed = 50;
        this._lightRapidJabAttack.canCancelAfter = 93;
        this._lightRapidJabAttack.loop = false;
        this._lightRapidJabAttack.start = function ()
        {
            this.playAnimation();
            this.player._canMove = false;
            this.player._canTransition = false;
            this.player._canBeHit = true;
            this.player._canWallRun = false;
        }
        this._lightRapidJabAttack.update = () => {
        }
        this._lightRapidJabAttack.onAnimationEnd = () => {
            if (this._lightAttackInput) {
                this._changeAnimationState(this._lightRapidJabAttack, true);
            } else {
                this._changeAnimationState(this._lightFinisherAttack);
            }
        }
        this._lightRapidJabAttack.stop = function () {
        }
        this._lightRapidJabAttack.doesMovement = false;
        this._lightRapidJabAttack.hitCastOffsets = [new Vector3(0, 0.53, 0), new Vector3(0, 0.53, 0), new Vector3(0, 0.53, 0)];
        this._lightRapidJabAttack.hitCastVectors = [new Vector3(0.7, 0, 0), new Vector3(0.49, 0.49, 0), new Vector3(0.49, -0.49, 0)];
        this._lightRapidJabAttack.hitstun = 0.3;
        this._lightRapidJabAttack.launchDirection = new Vector3(1, 0, 0);
        this._lightRapidJabAttack.damage = 2;
        this._lightRapidJabAttack.startupFrame = 87;
        this._lightRapidJabAttack.activeFrame = 87;
        this._lightRapidJabAttack.recoveryFrame = 92;

        /* */

        this._lightFinisherAttack.player = this;
        this._lightFinisherAttack.spritePlayer = this._spritePlayer;
        this._lightFinisherAttack.from = 93;
        this._lightFinisherAttack.to = 107;
        this._lightFinisherAttack.speed = 50;
        this._lightFinisherAttack.canCancelAfter = 105;
        this._lightFinisherAttack.loop = false;
        this._lightFinisherAttack.start = function ()
        {
            this.playAnimation();
            this.player._canMove = false;
            this.player._canTransition = false;
            this.player._canBeHit = true;
            this.player._canWallRun = false;
            this.player._lightFinisherAttackVelocity.rotateByQuaternionToRef(this.player._transform.rotationQuaternion, this.player._lightFinisherAttackVelocityCurrent);
            this.player._velocity.copyFrom(this.player._lightFinisherAttackVelocityCurrent);
        }
        this._lightFinisherAttack.update = () => {
        }
        this._lightFinisherAttack.onAnimationEnd = () => {
            this._changeAnimationState(this._idleAnimation);
        }
        this._lightFinisherAttack.doesMovement = false;
        this._lightFinisherAttack.doMovement = () => {
            /* move the player forward, slowing down over time */
            //todo
        }
        this._lightFinisherAttack.stop = function () {
        }
        this._lightFinisherAttack.hitCastOffsets = [new Vector3(-0.2, 0.53, 0)];
        this._lightFinisherAttack.hitCastVectors = [new Vector3(0.64, 0, 0)];
        this._lightFinisherAttack.hitstun = 0.3;
        this._lightFinisherAttack.launchDirection = new Vector3(10, 5, 0);
        this._lightFinisherAttack.damage = 15;
        this._lightFinisherAttack.startupFrame = 93;
        this._lightFinisherAttack.activeFrame = 95;
        this._lightFinisherAttack.recoveryFrame = 103;

        /* */

        this._heavy1Attack.player = this;
        this._heavy1Attack.spritePlayer = this._spritePlayer;
        this._heavy1Attack.from = 115;
        this._heavy1Attack.to = 124;
        this._heavy1Attack.speed = 50;
        this._heavy1Attack.canCancelAfter = 124;
        this._heavy1Attack.loop = false;
        this._heavy1Attack.start = function ()
        {
            this.playAnimation();
            this.player._canMove = false;
            this.player._canTransition = false;
            this.player._canBeHit = true;
            this.player._canWallRun = false;
        }
        this._heavy1Attack.update = () => {
        }
        this._heavy1Attack.onAnimationEnd = () => {
            this._changeAnimationState(this._idleAnimation);
        }
        this._heavy1Attack.stop = function () {
        }
        this._heavy1Attack.doesMovement = false;
        this._heavy1Attack.hitCastOffsets = [new Vector3(0, 0.4, 0)];
        this._heavy1Attack.hitCastVectors = [new Vector3(0.82, 0, 0)];
        this._heavy1Attack.hitstun = 0.5;
        this._heavy1Attack.launchDirection = new Vector3(15, 5, 0);
        this._heavy1Attack.damage = 20;
        this._heavy1Attack.startupFrame = 115;
        this._heavy1Attack.activeFrame = 121;
        this._heavy1Attack.recoveryFrame = 123;

        /* */

        this._heavyLauncherAttack.player = this;
        this._heavyLauncherAttack.spritePlayer = this._spritePlayer;
        this._heavyLauncherAttack.from = 109;
        this._heavyLauncherAttack.to = 114;
        this._heavyLauncherAttack.speed = 50;
        this._heavyLauncherAttack.canCancelAfter = 114;
        this._heavyLauncherAttack.loop = false;
        this._heavyLauncherAttack.start = function ()
        {
            this.playAnimation();
            this.player._canMove = false;
            this.player._canTransition = false;
            this.player._canBeHit = true;
            this.player._canWallRun = false;
        }
        this._heavyLauncherAttack.update = () => {
        }
        this._heavyLauncherAttack.onAnimationEnd = () => {
            this._changeAnimationState(this._idleAnimation);

        }
        this._heavyLauncherAttack.stop = function () {
        }
        this._heavyLauncherAttack.doesMovement = false;
        this._heavyLauncherAttack.hitCastOffsets = [new Vector3(0, 0.2, 0)];
        this._heavyLauncherAttack.hitCastVectors = [new Vector3(0.64, 0.72, 0)];
        this._heavyLauncherAttack.hitstun = 0.25;
        this._heavyLauncherAttack.launchDirection = new Vector3(1, 10, 0);
        this._heavyLauncherAttack.damage = 10;
        this._heavyLauncherAttack.startupFrame = 109;
        this._heavyLauncherAttack.activeFrame = 111;
        this._heavyLauncherAttack.recoveryFrame = 113;

        /* */

        this._jumpKickAttack.player = this;
        this._jumpKickAttack.spritePlayer = this._spritePlayer;
        this._jumpKickAttack.from = 49;
        this._jumpKickAttack.to = 57;
        this._jumpKickAttack.speed = 50;
        this._jumpKickAttack.canCancelAfter = 54;
        this._jumpKickAttack.loop = false;
        this._jumpKickAttack.start = function ()
        {
            this.playAnimation();
            this.player._canMove = true;
            this.player._canTransition = false;
            this.player._canBeHit = true;
            this.player._canWallRun = false;
        }
        this._jumpKickAttack.update = () => {
            if (this._grounded){
                this._changeAnimationState(this._idleAnimation);
            }
        }
        this._jumpKickAttack.onAnimationEnd = () => {
            this._changeAnimationState(this._fallAnimation);
        }
        this._jumpKickAttack.stop = function () {
        }
        this._jumpKickAttack.doesMovement = false;
        this._jumpKickAttack.doMovement = this.airAttackDoMovement;
        this._jumpKickAttack.hitCastOffsets = [new Vector3(0, 0.53, 0)];
        this._jumpKickAttack.hitCastVectors = [new Vector3(0.70, 0, 0)];
        this._jumpKickAttack.hitstun = 0.3;
        this._jumpKickAttack.launchDirection = new Vector3(10, 2.5, 0);
        this._jumpKickAttack.damage = 10;
        this._jumpKickAttack.startupFrame = 49;
        this._jumpKickAttack.activeFrame = 49;
        this._jumpKickAttack.recoveryFrame = 57;

        /* */

        this._jumpDiveKickAttack.player = this;
        this._jumpDiveKickAttack.spritePlayer = this._spritePlayer;
        this._jumpDiveKickAttack.from = 58;
        this._jumpDiveKickAttack.to = 66;
        this._jumpDiveKickAttack.speed = 50;
        this._jumpDiveKickAttack.canCancelAfter = 66;
        this._jumpDiveKickAttack.loop = false;
        this._jumpDiveKickAttack.start = function ()
        {
            this.playAnimation();
            this.player._canMove = false;
            this.player._canTransition = false;
            this.player._canBeHit = true;
            this.player._canWallRun = false;
            this.player._jumpDiveKickAttackVelocity.rotateByQuaternionToRef(this.player._transform.rotationQuaternion, this.player._jumpDiveKickAttackVelocityCurrent);
            Player._dashSound.play();
        }
        this._jumpDiveKickAttack.update = () => {
            if (this._grounded){
                this._changeAnimationState(this._idleAnimation);
            }
        }
        this._jumpDiveKickAttack.onAnimationEnd = () => {
            this._changeAnimationState(this._fallAnimation);
        }
        this._jumpDiveKickAttack.stop = function () {
        }
        this._jumpDiveKickAttack.doesMovement = true;
        this._jumpDiveKickAttack.doMovement = () => {
            /* move the player diagonally down/forward */
            this._transform.position.addInPlace(this._jumpDiveKickAttackVelocityCurrent.scale(this._deltaTime));
        }
        this._jumpDiveKickAttack.hitCastOffsets = [new Vector3(0, 0.5, 0)];
        this._jumpDiveKickAttack.hitCastVectors = [new Vector3(0.5, -0.5, 0)];
        this._jumpDiveKickAttack.hitstun = 0.3;
        this._jumpDiveKickAttack.launchDirection = new Vector3(10, -20, 0);
        this._jumpDiveKickAttack.damage = 20;
        this._jumpDiveKickAttack.startupFrame = 58;
        this._jumpDiveKickAttack.activeFrame = 58;
        this._jumpDiveKickAttack.recoveryFrame = 66;

        /* */

        this._shootGunAttack.player = this;
        this._shootGunAttack.spritePlayer = this._spritePlayer;
        this._shootGunAttack.from = 188;
        this._shootGunAttack.to = 199;
        this._shootGunAttack.speed = 100;
        this._shootGunAttack.canCancelAfter = 197;
        this._shootGunAttack.loop = false;
        this._shootGunAttack.start = function ()
        {
            this.playAnimation();
            this.player._canMove = false;
            this.player._canTransition = false;
            this.player._canBeHit = true;
            this.player._canWallRun = false;

            /* create projectile */
        }
        this._shootGunAttack.update = () => {
            /* if current frame is active frame, make bullet projectile particle */
            if (this._spritePlayer.cellIndex - this._shootGunAttack.from == 3){
                Player._gunSound.play();
            }
        }
        this._shootGunAttack.onAnimationEnd = () => {
            this._changeAnimationState(this._idleGunAnimation);
        }
        this._shootGunAttack.stop = function () {
        }
        this._shootGunAttack.doesMovement = false;
        this._shootGunAttack.hitCastOffsets = [new Vector3(0, 0.53, 0)];
        this._shootGunAttack.hitCastVectors = [new Vector3(100, 0, 0)];
        this._shootGunAttack.hitstun = 0.3;
        this._shootGunAttack.launchDirection = new Vector3(10, 5, 0);
        this._shootGunAttack.damage = 10;
        this._shootGunAttack.startupFrame = 188;
        this._shootGunAttack.activeFrame = 191;
        this._shootGunAttack.recoveryFrame = 192;

        /* */

        this._shootGunPos45Attack.player = this;
        this._shootGunPos45Attack.spritePlayer = this._spritePlayer;
        this._shootGunPos45Attack.from = 200;
        this._shootGunPos45Attack.to = 211;
        this._shootGunPos45Attack.speed = 100;
        this._shootGunPos45Attack.canCancelAfter = 209;
        this._shootGunPos45Attack.loop = false;
        this._shootGunPos45Attack.start = function ()
        {
            this.playAnimation();
            this.player._canMove = false;
            this.player._canTransition = false;
            this.player._canBeHit = true;
            this.player._canWallRun = false;

            /* create projectile */
        }
        this._shootGunPos45Attack.update = () => {
            /* if current frame is active frame, make bullet projectile particle */
            if (this._spritePlayer.cellIndex - this._shootGunPos45Attack.from == 3){
                Player._gunSound.play();
            }

        }
        this._shootGunPos45Attack.onAnimationEnd = () => {
            this._changeAnimationState(this._idleGunAnimation);
        }
        this._shootGunPos45Attack.stop = function () {
        }
        this._shootGunPos45Attack.doesMovement = false;
        this._shootGunPos45Attack.hitCastOffsets = [new Vector3(0, 0.53, 0)];
        this._shootGunPos45Attack.hitCastVectors = [new Vector3(70.7, 70.7, 0)];
        this._shootGunPos45Attack.hitstun = 0.3;
        this._shootGunPos45Attack.launchDirection = new Vector3(10, 5, 0);
        this._shootGunPos45Attack.damage = 10;
        this._shootGunPos45Attack.startupFrame = 200;
        this._shootGunPos45Attack.activeFrame = 203;
        this._shootGunPos45Attack.recoveryFrame = 204;

        /* */

        this._jumpShootGunAttack.player = this;
        this._jumpShootGunAttack.spritePlayer = this._spritePlayer;
        this._jumpShootGunAttack.from = 212;
        this._jumpShootGunAttack.to = 223;
        this._jumpShootGunAttack.speed = 100;
        this._jumpShootGunAttack.canCancelAfter = 220;
        this._jumpShootGunAttack.loop = false;
        this._jumpShootGunAttack.start = function ()
        {
            this.playAnimation();
            this.player._canMove = true;
            this.player._canTransition = false;
            this.player._canBeHit = true;
            this.player._canWallRun = false;
        }
        this._jumpShootGunAttack.update = () => {
            /* if current frame is active frame, make bullet projectile particle */
            if (this._grounded){
                this._changeAnimationState(this._idleAnimation);
                return;
            }
            if (this._spritePlayer.cellIndex - this._jumpShootGunAttack.from == 3){
                Player._gunSound.play();
            }
        }
        this._jumpShootGunAttack.onAnimationEnd = () => {
            this._changeAnimationState(this._fallAnimation);
        }
        this._jumpShootGunAttack.stop = function () {
        }
        this._jumpShootGunAttack.doesMovement = false;
        this._jumpShootGunAttack.doMovement = this.airAttackDoMovement;
        this._jumpShootGunAttack.hitCastOffsets = [new Vector3(0, 0.53, 0)];
        this._jumpShootGunAttack.hitCastVectors = [new Vector3(100, 0, 0)];
        this._jumpShootGunAttack.hitstun = 0.3;
        this._jumpShootGunAttack.launchDirection = new Vector3(10, 5, 0);
        this._jumpShootGunAttack.damage = 10;
        this._jumpShootGunAttack.startupFrame = 212;
        this._jumpShootGunAttack.activeFrame = 215;
        this._jumpShootGunAttack.recoveryFrame = 216;

        /* */

        this._jumpShootGunPos45Attack.player = this;
        this._jumpShootGunPos45Attack.spritePlayer = this._spritePlayer;
        this._jumpShootGunPos45Attack.from = 224;
        this._jumpShootGunPos45Attack.to = 235;
        this._jumpShootGunPos45Attack.speed = 100;
        this._jumpShootGunPos45Attack.canCancelAfter = 232;
        this._jumpShootGunPos45Attack.loop = false;
        this._jumpShootGunPos45Attack.start = function ()
        {
            this.playAnimation();
            this.player._canMove = true;
            this.player._canTransition = false;
            this.player._canBeHit = true;
            this.player._canWallRun = false;
        }
        this._jumpShootGunPos45Attack.update = () => {
            /* if current frame is active frame, make bullet projectile particle */

            if (this._grounded){
                this._changeAnimationState(this._idleAnimation);
                return;
            }
            if (this._spritePlayer.cellIndex - this._jumpShootGunPos45Attack.from == 3){
                Player._gunSound.play();
            }
        }
        this._jumpShootGunPos45Attack.onAnimationEnd = () => {
            this._changeAnimationState(this._fallAnimation);
        }
        this._jumpShootGunPos45Attack.stop = function () {
        }
        this._jumpShootGunPos45Attack.doesMovement = false;
        this._jumpShootGunPos45Attack.doMovement = this.airAttackDoMovement;
        this._jumpShootGunPos45Attack.hitCastOffsets = [new Vector3(0, 0.53, 0)];
        this._jumpShootGunPos45Attack.hitCastVectors = [new Vector3(70.7, 70.7, 0)];
        this._jumpShootGunPos45Attack.hitstun = 0.3;
        this._jumpShootGunPos45Attack.launchDirection = new Vector3(10, 5, 0);
        this._jumpShootGunPos45Attack.damage = 10;
        this._jumpShootGunPos45Attack.startupFrame = 224;
        this._jumpShootGunPos45Attack.activeFrame = 227;
        this._jumpShootGunPos45Attack.recoveryFrame = 228;

        /* */

        this._jumpShootGunNeg45Attack.player = this;
        this._jumpShootGunNeg45Attack.spritePlayer = this._spritePlayer;
        this._jumpShootGunNeg45Attack.from = 236;
        this._jumpShootGunNeg45Attack.to = 247;
        this._jumpShootGunNeg45Attack.speed = 100;
        this._jumpShootGunNeg45Attack.canCancelAfter = 243;
        this._jumpShootGunNeg45Attack.loop = false;
        this._jumpShootGunNeg45Attack.start = function ()
        {
            this.playAnimation();
            this.player._canMove = true;
            this.player._canTransition = false;
            this.player._canBeHit = true;
            this.player._canWallRun = false;
        }
        this._jumpShootGunNeg45Attack.update = () => {
            /* if current frame is active frame, make bullet projectile particle */
            if (this._grounded){
                this._changeAnimationState(this._idleAnimation);
                return;
            }
            if (this._spritePlayer.cellIndex - this._jumpShootGunNeg45Attack.from == 3){
                Player._gunSound.play();
            }
        }
        this._jumpShootGunNeg45Attack.onAnimationEnd = () => {
            this._changeAnimationState(this._fallAnimation);
        }
        this._jumpShootGunNeg45Attack.stop = function () {
        }
        this._jumpShootGunNeg45Attack.doesMovement = false;
        this._jumpShootGunNeg45Attack.doMovement = this.airAttackDoMovement;
        this._jumpShootGunNeg45Attack.hitCastOffsets = [new Vector3(0, 0.6, 0)];
        this._jumpShootGunNeg45Attack.hitCastVectors = [new Vector3(70.7, -70.7, 0)];
        this._jumpShootGunNeg45Attack.hitstun = 0.3;
        this._jumpShootGunNeg45Attack.launchDirection = new Vector3(10, 5, 0);
        this._jumpShootGunNeg45Attack.damage = 10;
        this._jumpShootGunNeg45Attack.startupFrame = 236;
        this._jumpShootGunNeg45Attack.activeFrame = 239;
        this._jumpShootGunNeg45Attack.recoveryFrame = 240;

        /* */

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
            this.player._wallRanAlready = true;
            this.player._canMove = false;
            this.player._canTransition = false;
            this.player._canBeHit = true;
            this.player._canWallRun = true;
            this.player._wallRunSpeedCurrent = this.player._wallRunSpeed;
        }
        this._wallRunAnimation.update = () => {
            this._wallRunSpeedCurrent -= this._deltaTime * this._wallRunSpeedSlowdownRate;
            /* Allow the player to stop wall running when wallRun is released */
            if (!this._isPressingForward() || this._wallRunSpeedCurrent <= 0){
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
            this.player._canTransition = false;
            this.player._canBeHit = true;
            this.player._canWallRun = true;
            this.player._wallJumpSpeedCurrent.copyFrom(this.player._wallJumpSpeed);
            Player._jumpSound.play();
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
        }

        this._hitAnimation.player = this;
        this._hitAnimation.spritePlayer = this._spritePlayer;
        this._hitAnimation.from = 125;
        this._hitAnimation.to = 125;
        this._hitAnimation.speed = 50;
        this._hitAnimation.loop = false;
        this._hitAnimation.canCancelAfter = 87;
        this._hitAnimation.start = function()
        {
            this.playAnimation();
            this.player._canMove = false;
            this.player._canTransition = false;
            this.player._canBeHit = false;
            this.player._canWallRun = false;
            Player._hitSound.play();
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

        this._hitGunAnimation.player = this;
        this._hitGunAnimation.spritePlayer = this._spritePlayer;
        this._hitGunAnimation.from = 248;
        this._hitGunAnimation.to = 248;
        this._hitGunAnimation.speed = 50;
        this._hitGunAnimation.loop = false;
        this._hitGunAnimation.canCancelAfter = 248;
        this._hitGunAnimation.start = function()
        {
            this.playAnimation();
            this.player._canMove = false;
            this.player._canTransition = false;
            this.player._canBeHit = false;
            this.player._canWallRun = false;
            Player._hitSound.play();
        }
        this._hitGunAnimation.update = () => {
            if (this._hitTimer <= 0){
                this._changeAnimationState(this._idleAnimation);
            }
        };
        this._hitGunAnimation.doesMovement = true;
        this._hitGunAnimation.doMovement = () => {
            this._velocity.copyFrom(this._knockbackDirection);
            this._transform.position.addInPlace(this._velocity.scale(this._deltaTime));
        }

        this._dieAnimation.player = this;
        this._dieAnimation.spritePlayer = this._spritePlayer;
        this._dieAnimation.from = 126;
        this._dieAnimation.to = 126;
        this._dieAnimation.speed = 100;
        this._dieAnimation.loop = false;
        this._dieAnimation.canCancelAfter = 87;
        this._dieAnimation.start = function()
        {
            this.playAnimation();
            this.player._canMove = false;
            this.player._canTransition = false;
            this.player._canBeHit = false;
            this.player._canWallRun = false;
            this.player._dieTimerCurrent = 0;
            Player._dieSound.play();
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
        if (this._enabled){
            this._checkColliders();
            this._updateTimers();
            this._doStateTransition();
            this._doMovement();
        }
    }

    private _flip() {
        this._flipped = !this._flipped;

        /* rotate 180deg about the Y-axis to flip character orientation for locomotion computations and collider orientation */
        this._transform.rotate(Vector3.Up(), Math.PI);

        /* we need to manually tell the sprite player to render the sprite as X flipped */
        this._spritePlayer.invertU = this._flipped;
    }

    protected _updateInput(): void {
        let deviceType = this._useTouchscreen ? DeviceType.Touch : this.deviceSource.deviceType;
        switch(deviceType) {
            case DeviceType.Keyboard:
                this._moveInput.copyFromFloats(this._deviceSource.getInput(68) - this._deviceSource.getInput(65), /* D = X+, A = X- */
                                               this._deviceSource.getInput(87) - this._deviceSource.getInput(83), /* W = Y+, S = Y- */
                                               0);
                this._jumpInput = this._deviceSource.getInput(32) != null ? this._deviceSource.getInput(32) != 0 : false;         /* jump = space */
                this._dashInput = this._deviceSource.getInput(16) != null ? this._deviceSource.getInput(16) != 0 : false;         /* dash = shift */
                this._lightAttackInput = this._deviceSource.getInput(74) != null ? this._deviceSource.getInput(74) != 0 : false;  /* light attack = J */
                this._heavyAttackInput = this._deviceSource.getInput(75) != null ? this._deviceSource.getInput(75) != 0 : false;  /* heavy attack = K */
                this._switchGunInput = this._deviceSource.getInput(76) != null ? this._deviceSource.getInput(76) != 0 : false;    /* switch to gun = L */
                break;
            case DeviceType.DualShock:
                this._moveInput.copyFromFloats(this._deviceSource.getInput(DualShockInput.LStickXAxis) + this._deviceSource.getInput(DualShockInput.DPadRight) - this._deviceSource.getInput(DualShockInput.DPadLeft),
                                               -this._deviceSource.getInput(DualShockInput.LStickYAxis) + this._deviceSource.getInput(DualShockInput.DPadUp)    - this._deviceSource.getInput(DualShockInput.DPadDown),
                                               0);
                this._jumpInput = this._deviceSource.getInput(DualShockButton.Cross) != 0;
                this._dashInput = this._deviceSource.getInput(DualShockButton.R1) != 0;
                this._lightAttackInput = this._deviceSource.getInput(DualShockButton.Square) != 0;
                this._heavyAttackInput = this._deviceSource.getInput(DualShockButton.Triangle) != 0;
                this._switchGunInput = this._deviceSource.getInput(DualShockButton.Circle) != 0;
                break;
            case DeviceType.Switch:
                this._moveInput.copyFromFloats(this._deviceSource.getInput(SwitchInput.LStickXAxis) + this._deviceSource.getInput(SwitchInput.DPadRight) - this._deviceSource.getInput(SwitchInput.DPadLeft),
                                               -this._deviceSource.getInput(SwitchInput.LStickYAxis) + this._deviceSource.getInput(SwitchInput.DPadUp)    - this._deviceSource.getInput(SwitchInput.DPadDown),
                                               0);
                this._jumpInput = this._deviceSource.getInput(SwitchInput.B) != 0;
                this._dashInput = this._deviceSource.getInput(SwitchInput.R) != 0;
                this._lightAttackInput = this._deviceSource.getInput(SwitchInput.Y) != 0;
                this._heavyAttackInput = this._deviceSource.getInput(SwitchInput.X) != 0;
                this._switchGunInput = this._deviceSource.getInput(SwitchInput.A) != 0;
                break;
            case DeviceType.Touch:
                let touchJoystick = this._game.gameUI.touchJoystick;
                this._moveInput.copyFrom(touchJoystick.moveInput);
                this._jumpInput = touchJoystick.jumpInput;
                this._dashInput = touchJoystick.dashInput;
                this._lightAttackInput = touchJoystick.lightAttackInput;
                this._heavyAttackInput = touchJoystick.heavyAttackInput;
                this._switchGunInput = touchJoystick.switchGunInput;
                break;
            case DeviceType.Xbox:
            case DeviceType.Generic:
                this._moveInput.copyFromFloats(this._deviceSource.getInput(XboxInput.LStickXAxis) + this._deviceSource.getInput(XboxInput.DPadRight) - this._deviceSource.getInput(XboxInput.DPadLeft),
                                               -this._deviceSource.getInput(XboxInput.LStickYAxis) + this._deviceSource.getInput(XboxInput.DPadUp)    - this._deviceSource.getInput(XboxInput.DPadDown),
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

    private _isPressingForward(): boolean {
        return (this._flipped && this._moveInput.x < 0 || !this._flipped && this._moveInput.x > 0)
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
            /* set the movement vector using the player locomotion */
            this._velocity.copyFromFloats(this._velocity.x * (1 - (this._grounded ? this._groundFriction.x : this._airFriction.x)),
                                            this._velocity.y * (1 - (this._grounded ? this._groundFriction.y : this._airFriction.y)),
                                            this._velocity.z * (1 - (this._grounded ? this._groundFriction.z : this._airFriction.z)));
            if (!this._grounded && this._jumpSpeedCurrent <= 0){
                this.doGravityMovement(this._velocity);
            }else if (this._grounded){
                this._velocity.y = 0;
            }
            if (this._canMove) {
                this.doHorizontalMovement(this._velocity);
            }
            if (this._jumpSpeedCurrent > 0) {
                this.doJumpMovement(this._velocity);
            }
            let posDelta = this._velocity.scale(this._deltaTime);
            this._transform.position.addInPlace(posDelta);
        }
        this.applyBounds();
    }

    private airAttackDoMovement = () => {
        this._velocity.copyFromFloats(this._velocity.x * this._groundFriction.x,
                                      this._velocity.y * this._groundFriction.y,
                                      this._velocity.z * this._groundFriction.z);
        if ( this._jumpSpeedCurrent > 0){
            this.doJumpMovement(this._velocity);
        }
        this._transform.position.addInPlace(this._velocity.scale(this._deltaTime));
    };

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
        if (this._jumpSpeedCurrent > 0){
            this._jumpSpeedCurrent -= this._deltaTime * this._jumpSpeedSlowdownRate;
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
        } else if (this._canTransition) {
            if ((((this._facingWall && this._canWallRun) && this._isPressingForward())
                    || this._wallJumpTimerElapsed > 0)
                && !this._wallRanAlready){
                this._changeAnimationState(this._wallRunAnimation);
            } else if (this._lightAttackInput) {
                if (this._gunDrawn) {
                    if (this._grounded){
                        if (this._moveInput.y > 0){
                            this._changeAnimationState(this._shootGunPos45Attack);
                        } else {
                            this._changeAnimationState(this._shootGunAttack);
                        }
                    }else{
                        if (this._moveInput.y > 0){
                            this._changeAnimationState(this._jumpShootGunPos45Attack);
                        } else if (this._moveInput.y < 0) {
                            this._changeAnimationState(this._jumpShootGunNeg45Attack);
                        } else {
                            this._changeAnimationState(this._jumpShootGunAttack);
                        }
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
                        if (this._moveInput.y > 0){
                            this._changeAnimationState(this._heavyLauncherAttack);
                        } else {
                            this._changeAnimationState(this._heavy1Attack);
                        }
                    } else {
                        this._changeAnimationState(this._jumpDiveKickAttack);
                    }
                }
            } else if (this._switchGunInput && this._grounded) {
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
        hurtbox.layerMask = Game.HURTBOX_LAYER;
        this._hurtboxes.push(hurtbox);

        /* offset the player collider such that the transform origin is at the collider's bottom */
        hurtbox.position = new Vector3(0, 0.5, 0);
        hurtbox.bakeCurrentTransformIntoVertices();
        hurtbox.setParent(this._transform);
    }

    public applyHit(hit: HitEvent): void {
        if (this._canBeHit){
            this._hitTimer = hit.attack.hitstun;
            this._knockbackDirection.copyFrom(hit.launchVector);
            this._takeDamage(hit.attack.damage);
        }
    }

    private _setHealth(health: number){
        this._health = health;
        this.onHealthChanged.notifyObservers(health);
    }

    private _takeDamage(damage: number){
        this._setHealth(this._health -= damage);
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

    public getName(): string {
        return "Player_" + this._playerIndex;
    }

    public getTransform(): TransformNode {
        return this._transform;
    }

    public getIndex(): number {
        return this._playerIndex;
    }

    public getHealth(): number {
        return this._health;
    }

    public getMaxHealth(): number {
        return this._maxHealth;
    }
}