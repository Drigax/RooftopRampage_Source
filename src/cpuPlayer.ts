import { Game } from "./game"

import { IDisposable, Scene } from "@babylonjs/core/Scene";
import { DeviceSource } from "@babylonjs/core/DeviceInput";
import { Player, Attack, AnimationState } from "./player";
import { Vector3 } from "@babylonjs/core/Maths";

enum CpuBehavior {
    Approach,
    Evade,
}

enum CpuAttack{
    Light,
    Heavy,
    Launcher,
}

enum CpuGunState{
    Unequipped,
    Equipped
}

export class CpuPlayer extends Player{

    private _dodgePercentage = 0.1;
    private currentBehavior: CpuBehavior = CpuBehavior.Approach;
    private evadeBehaviorPercentage = 0.005;
    private lightVsHeavyAttackPercentage = 0.6;
    private enemy: Player;
    private enemyPositionDelay: Vector3[] = [];
    private enemyPositionDelayFrames: number = 35;

    private enemyDistance: Vector3 = new Vector3();
    private meleeEngagementRange = 0.7;
    private gunEngagementRange = 8;
    private _switchGunPercentage = 0.05;
    private _switchGunPercentageCurrent = 0.05;

    private _switchGunCooldownCurrent: number = 3;
    private _switchGunCooldown: number = 3;
    private _switchGunFramesCooldownCurrent: number = 0;
    private _switchGunFramesCooldown = 0.5;

    private behaviorSwitchTimer = 0.5;
    private behaviorSwitchTimerCurrent = 0;


    constructor(game: Game, scene: Scene, playerIndex: number, deviceSource: DeviceSource<any>, enabled: boolean = false) {
        super(game, scene, playerIndex, deviceSource, enabled);
        console.log("Player - " + playerIndex + " is CPU!");
    }

    protected _updateInput(): void {
        let randomBehaviorInput = Math.random();
        let randomAttackInput = Math.random();
        let randomSwitchGunInput = Math.random();

        if (!this.enemy){
            this.enemy = this._game.players[0];
        }
        this.enemyPositionDelay.push(this.enemy.getTransform().position);
        if (this.enemyPositionDelay.length > this.enemyPositionDelayFrames){
            this.enemyPositionDelay.shift();
        }
        let delayedEnemyPosition = this.enemyPositionDelay[this.enemyPositionDelay.length-1];
        let directionToEnemy = delayedEnemyPosition.subtractToRef(this.getTransform().position, this.enemyDistance);
        let engagementRange = this._gunDrawn? this.gunEngagementRange : this.meleeEngagementRange;

        this._switchGunInput = false;
        this._lightAttackInput = false;
        this._heavyAttackInput = false;
        this._jumpInput = false;
        this._moveInput.x = 0;
        this._moveInput.y = 0;
        this._switchGunFramesCooldown -= this._deltaTime;
        this._switchGunCooldownCurrent -= this._deltaTime;
        this.behaviorSwitchTimerCurrent -= this._deltaTime;

        if(randomBehaviorInput < this.evadeBehaviorPercentage && this.behaviorSwitchTimerCurrent <= 0){
            this.behaviorSwitchTimerCurrent = this.behaviorSwitchTimer;
        }
        if (this.behaviorSwitchTimerCurrent > 0){
            this.currentBehavior = CpuBehavior.Evade;
        } else{
            this.currentBehavior = CpuBehavior.Approach;
        }

        /* During some attacks, its best to not input until the attack has completed to avoid getting stuck in the animation loop */
        if (this._currentAnimation instanceof Attack &&
            (this._currentAnimation == this._shootGunAttack ||
            this._currentAnimation == this._shootGunPos45Attack ||
            this._currentAnimation == this._jumpShootGunAttack ||
            this._currentAnimation == this._jumpShootGunPos45Attack ||
            this._currentAnimation == this._jumpShootGunNeg45Attack)){
            return;
        }
        if (this._currentAnimation === this._switchGunAnimation){
            return;
        }

        if ( randomSwitchGunInput < this._switchGunPercentageCurrent && this._switchGunCooldownCurrent <= 0 ){
            this._switchGunInput = true;
            if (this._gunDrawn){
                this._switchGunPercentageCurrent = this._switchGunPercentage;
            }
            this._switchGunCooldownCurrent = this._switchGunCooldown;
            return;
        }

        switch(this.currentBehavior){
            case CpuBehavior.Approach:
                if (directionToEnemy.x < -engagementRange || (!this._flipped && directionToEnemy.x < 0) ) {
                    this._moveInput.x = -1;
                } else if (directionToEnemy.x > engagementRange || (this._flipped && directionToEnemy.x > 0)) {
                    this._moveInput.x = 1;
                }

                if (directionToEnemy.y > 0){
                    this._jumpInput = true;
                }
                break;
            case CpuBehavior.Evade:
                if (directionToEnemy.x > 0 ){
                    this._moveInput.x = -1;
                } else {
                    this._moveInput.x = 1;
                }
                break;
        }

        if (directionToEnemy.length() < engagementRange
            && ((directionToEnemy.x <= 0 && this._flipped)
                || (directionToEnemy.x >= 0 && !this._flipped))){
            if (directionToEnemy.y > 0){
                // do launcher
                this._moveInput.y = 1;
                this._heavyAttackInput = true;
                this._lightAttackInput = false;
            } else {
                this._moveInput.y = 0;
                if (randomAttackInput > this.lightVsHeavyAttackPercentage){
                    this._heavyAttackInput = true;
                    this._lightAttackInput = false;
                } else {
                    this._heavyAttackInput = false;
                    this._lightAttackInput = true;
                }
            }
            if (this._gunDrawn){
                this._switchGunPercentageCurrent *= 4;
            }
        }
    }
}