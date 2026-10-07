use anchor_lang::prelude::*;
use anchor_spl::token_interface::{transfer_checked, TransferChecked, TokenInterface, TokenAccount, Mint};
use crate::states::RwaAsset;
use crate::events::OwnershipTransferred;
use crate::errors::RwaTokenizationError;
use crate::consts::AssetStatus;

#[derive(Accounts)]
pub struct TransferOwnership<'info> {
    #[account(
        seeds = [RwaAsset::SEEDS, asset.asset_id.as_ref()],
        bump,
        constraint = asset.is_tokenized @ RwaTokenizationError::AssetNotTokenized,
        constraint = asset.status == AssetStatus::Active @ RwaTokenizationError::InvalidAssetStatus,
        constraint = asset.status != AssetStatus::Frozen @ RwaTokenizationError::AssetFrozen
    )]
    pub asset: Box<Account<'info, RwaAsset>>,

    #[account(mut)]
    pub from: Signer<'info>,

    #[account(mut, constraint = from_token_account.owner == from.key(), constraint = from_token_account.mint == mint.key())]
    pub from_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(mut, constraint = to_token_account.mint == mint.key())]
    pub to_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(constraint = asset.mint == Some(mint.key()))]
    pub mint: InterfaceAccount<'info, Mint>,

    pub token_program: Interface<'info, TokenInterface>,
    pub clock: Sysvar<'info, Clock>,
}

impl<'info> TransferOwnership<'info> {
    pub fn process(&self, amount: u64) -> Result<()> {
        require!(
            amount > 0,
            RwaTokenizationError::InsufficientBalance
        );

        // Transfer tokens
        let cpi_accounts = TransferChecked {
            from: self.from_token_account.to_account_info(),
            to: self.to_token_account.to_account_info(),
            mint: self.mint.to_account_info(),
            authority: self.from.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(
            self.token_program.to_account_info(),
            cpi_accounts,
        );
        transfer_checked(cpi_ctx, amount, self.mint.decimals)?;

        // Emit event
        emit!(OwnershipTransferred {
            asset_id: self.asset.key(),
            from: self.from.key(),
            to: self.to_token_account.key(),
            amount,
        });

        Ok(())
    }
}
